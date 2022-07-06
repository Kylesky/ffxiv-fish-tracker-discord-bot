import * as dateFns from "date-fns";
import * as dateFnsExt from "./date-fns-ext.js";
import * as dateFnsUtc from "./date-fns-utc.js";
import weatherService from "./weather.js";
import _ from "underscore";
import eorzeaTime from "./time.js";
import Fishes from "./fish.js";


function startOfPeriod(d) {
  return dateFnsUtc.startOfHour(
    dateFnsUtc.setHours(d, parseInt(dateFnsUtc.getHours(d) / 8) * 8));
}

class FishWatcher {
  constructor() {
    // Total number of windows to keep track of.
    this.maxWindows = 10;
  }


  _isFishAlwaysUp(fish) {
	return fish.alwaysAvailable;
  }

  updateRangesForFish(fish) {
    var eDate = eorzeaTime.getCurrentEorzeaDate();
    while (fish.catchableRanges.length > 0 &&
        dateFnsExt.isSameOrAfter(eDate, fish.catchableRanges[0].end)) {
      // Remove the first entry from the array.
      fish.catchableRanges.shift();
    }

    // Need to know if the last range could span periods.
    var lastRangeSpansPeriods = false;

    // Restore any incomplete ranges first.
    if (fish.incompleteRanges.length > 0) {
      while (fish.catchableRanges.length < this.maxWindows) {
        var incompleteRange = fish.incompleteRanges.shift();
        if (incompleteRange !== undefined) {
          fish.catchableRanges.push(incompleteRange);
          // Set flag so that we don't immediately stop processing...
          lastRangeSpansPeriods = true;
        }
      }
    }

    // Resume from when the last window ended (if possible)
    var startOfWindow = null;
    var latestWindow = _(fish.catchableRanges).last();
    if (latestWindow) {
      startOfWindow = new Date(+latestWindow.end);
      var h = dateFnsUtc.getHours(startOfWindow);
      if (h != 0 && h != 8 && h != 16) {
        // OPTIMIZATION (and safeguard):
        // Since we always check the entire weather period, we need to move to
        // the next period if the last window ended before the period ended.
        startOfWindow = dateFnsUtc.addHours(startOfPeriod(startOfWindow), 8);
      }
    } else {
      // Use the current date as the start time (first run)
      startOfWindow = eorzeaTime.getCurrentEorzeaDate();
    }

    // Create a new iterator with no limit to get periods with favorable weather.
    // TODO: Should optimize this by skipping periods when the fish cannot appear.
    var weatherIter = weatherService.findWeatherPattern(
      startOfWindow,
      fish.location.zoneId,
      fish.previousWeatherSet,
      fish.weatherSet);

    while (fish.catchableRanges.length < this.maxWindows) {
      var _iterItem = weatherIter.next();
      if (_iterItem.done) {
        // console.warn("Stopped iterating early for:", fish);
        break;
      }
      lastRangeSpansPeriods =
        this.__checkToAddCatchableRange(fish, _iterItem.value);
    }
    weatherService.finishedWithIter();

    // Make sure the LAST window is complete!
    while (lastRangeSpansPeriods) {
      // Reset the flag.
      lastRangeSpansPeriods = false;
      // This time, just peek at the NEXT period.
      var iter = weatherService.findWeatherPattern(
        +_(fish.catchableRanges).last().end,
        fish.location.zoneId,
        fish.previousWeatherSet,
        fish.weatherSet,
        1);
      var _iterItem = iter.next();
      weatherService.finishedWithIter();
      if (_iterItem.done) { break; }
      lastRangeSpansPeriods =
        this.__checkToAddCatchableRange(fish, _iterItem.value);
    }
  }

  __checkToAddCatchableRange(fish, window) {
    // Found a time period where the weather is favorable. Now check if the
    // fish is even up. This really should be the other way around -_-
    // ^^ Who's laughing now? *puts on Fish Eyes shades*
    let spansPeriods = undefined;
    var nextRanges = fish.availableRangeDuring(window, this.fishEyesEnabled);
    for (var nextRange of nextRanges) {
      spansPeriods = this.__checkToAddCatchableRangeInner(fish, window, nextRange);
      // If will span periods, we need to double-check if we've already found enough
      // windows. If not, this will cause an infinite loop because of the late
      // side of the fish's window spanning periods.
      if (spansPeriods === true && fish.catchableRanges.length > this.maxWindows) {
        fish.stashIncompleteWindows(this.maxWindows);
        spansPeriods = false;
        break;
      }
    }
    return spansPeriods;
  }

  __checkToAddCatchableRangeInner(fish, window, nextRange) {
    if (!dateFns.areIntervalsOverlapping(window, nextRange)) {
      // Oops, this is why you need to optimize this...
      return false;
    }
    // SAFEGUARD! Verify this range hasn't already expired!!!
    // This is more here to prevent any future stupidity...
    if (dateFnsExt.isSameOrBefore(nextRange.end, eorzeaTime.getCurrentEorzeaDate())) {
      //console.error("Range has already expired:", nextRange.simpleFormat());
      return false;
    }
    // BUGFIX: the `availableRangeDuring` function always returns the FULL RANGE of the
    // fish, without clipping to the window if the range is "already in progress".
    // As a result, if a fish is up for multiple 8-hour windows, `nextRange` will keep
    // getting set to the same value. To solve this, we'll intersect nextRange with window.
    var origNextRange = nextRange;
    nextRange = dateFnsExt.intervalIntersection(nextRange, window);

    // If this fish has predators, we have to consider their windows too...
    // Basically, to ensure we get the same number of windows for every fish,
    // we'll intersect this range with the UNION of its predators' ranges.
    if (_(fish.predators).size() > 0) {
      var overallPredRange = null;
      var predatorsAlwaysAvailable = true;
      // This key value is in seconds, we will need to convert it to Eorzean time first
      var intuitionLength = fish.intuitionLength;
      // If no key was defined, default to 1 Eorzean hour duration
      // Keeping precision down to seconds here because of non-aligning intuition durations
      // (e.g. 100 Earth seconds)
      if (intuitionLength !== null && intuitionLength !== undefined) {
        intuitionLength = eorzeaTime.toEorzea(intuitionLength);
      } else { intuitionLength = 3600; }
      _(fish.predators).chain().keys().each((predId) => {
        var predatorFish = _(Fishes).findWhere({id: Number(predId)});
        if (this._isFishAlwaysUp(predatorFish)) { return nextRange; }
        predatorsAlwaysAvailable = false;
        // Once again, we need to check if the weather right now works for
        // the predator fish.
        var iter = weatherService.findWeatherPattern(
          +nextRange.start,
          predatorFish.location.zoneId,
          predatorFish.previousWeatherSet,
          predatorFish.weatherSet,
          1);
        var _iterItem = iter.next();
        weatherService.finishedWithIter();
        if (_iterItem.done) {
          // Wait wait wait, try one more thing.
          // Let's say you catch the fish during the intuition buff period!
          iter = weatherService.findWeatherPattern(
            +dateFnsUtc.subSeconds(nextRange.start, intuitionLength),
            predatorFish.location.zoneId,
            predatorFish.previousWeatherSet,
            predatorFish.weatherSet,
            1);
          _iterItem = iter.next();
          weatherService.finishedWithIter();
          if (_iterItem.done) { return; }
        }
        var predWindow = _iterItem.value;
        var predRanges = predatorFish.availableRangeDuring(predWindow, this.fishEyesEnabled);
        for (var predRange of predRanges) {
          if (!dateFns.areIntervalsOverlapping(predWindow, predRange)) { continue /*nextRange = null*/; }
          if (dateFnsExt.isSameOrBefore(predRange.end, eorzeaTime.getCurrentEorzeaDate())) {
            continue /*nextRange = null*/;
          }
          // Because of the "intuition window" being added, we need to re-constrain the predRange.
          predRange = dateFnsExt.intervalIntersection(predRange, predWindow);
          if (overallPredRange === null) {
            overallPredRange = predRange;
          } else {
            // COMBINE this predators range with the others.
            // This is necessary for fish with multiple predators which have
            // non-overlapping availability...
            overallPredRange = dateFnsExt.intervalUnion(overallPredRange, predRange);
          }
        }
        return nextRange;
      });
      // Reduce the next range by intersecting with OVERALL predator's range.
      if (predatorsAlwaysAvailable) {
        // Do nothing; keep nextRange intact
      } else if (overallPredRange === null) {
        nextRange = null;
      } else {
        // Increase the pred range by intuition buff time first.
        overallPredRange = { start: overallPredRange.start, end: dateFnsUtc.addSeconds(overallPredRange.end, intuitionLength) };
        nextRange = dateFnsExt.intervalIntersection(nextRange, overallPredRange);
      }
    }
    if (nextRange === null) {
      // None of its predators are available right now... Too bad...
      return false;
    }

    // Now for the complicated part...
    // Update the catchable ranges using the intersection of the next range
    // and the window itself. Merge together bordering windows.
    fish.addCatchableRange(dateFnsExt.intervalIntersection(nextRange, window));
    return dateFnsExt.isWithinInterval(+window.end + 1, origNextRange);
  }
}

export default new FishWatcher;
