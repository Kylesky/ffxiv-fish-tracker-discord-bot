const _9HR = 32400000;
const _45MIN = 2700000;
const _HR = 3600000;
const _DAY = 86400000;

// Cycle repeats every 12 days starting at this epoch
const LULU_EPOCH = 1593270000000 + _9HR;
const DEST_CYCLE = ['B', 'T', 'N', 'R'];
const TIME_CYCLE = ['S', 'S', 'S', 'S', 'N', 'N', 'N', 'N', 'D', 'D', 'D', 'D'];

function fromEpoch(day, hour){
  return LULU_EPOCH + day * _DAY + hour * _HR - _9HR;
};

const STOPS_SEQUENCE = {
  "B": ['C', 'N', 'B'],
  "N": ['S', 'G', 'N'],
  "R": ['G', 'S', 'R'],
  "T": ['C', 'R', 'T']
};

const TIMES_SEQUENCE = {
  "D": ['S', 'N', 'D'],
  "S": ['N', 'D', 'S'],
  "N": ['D', 'S', 'N']
};

function _calculateVoyages(date, count, filters) {
  const adjustedDate = date + _9HR - _45MIN; // Subtract 45 minutes to catch ongoing voyages
  let day = Math.floor((adjustedDate - LULU_EPOCH) / _DAY);
  let hour = (adjustedDate / _HR) % _DAY;

  // Adjust hour to be odd
  hour += (hour & 1) === 0 ? 1 : 2;
  if (hour > 23) {
    day += 1;
    hour -= 24;
  }

  // Find the current voyage
  const voyageNumber = hour >> 1;
  let destIndex = ((day + voyageNumber) % DEST_CYCLE.length + DEST_CYCLE.length) % DEST_CYCLE.length;
  let timeIndex = ((day + voyageNumber) % TIME_CYCLE.length + TIME_CYCLE.length) % TIME_CYCLE.length;

  // Loop until however many voyages are found
  const upcomingVoyages = [];
  while (upcomingVoyages.length < count) {
    const destTime = "" + DEST_CYCLE[destIndex] + TIME_CYCLE[timeIndex];
    // if (filter === undefined || filter.includes(destTime)) {
      upcomingVoyages.push(destTime);
    // }
    if (hour === 23) {
      day += 1;
      hour = 1;
      destIndex = (destIndex + 2) % DEST_CYCLE.length;
      timeIndex = (timeIndex + 2) % TIME_CYCLE.length;
    } else {
      hour += 2;
      destIndex = (destIndex + 1) % DEST_CYCLE.length;
      timeIndex = (timeIndex + 1) % TIME_CYCLE.length;
    }
  }

  return upcomingVoyages;
};

// Record the pattern for faster calculations
const pattern = _calculateVoyages(_45MIN, 144);

export default function calculateVoyages (date, count, filters) {
  const startIndex = Math.floor((date - _45MIN) / 7200000);
  const upcomingVoyages = [];

  for (let i = 0; upcomingVoyages.length < count && i < 100000; ++i) {
    const destTime = pattern[(startIndex + i) % 144];
    if (filters) {
	  for (let j=0; j<3; j++){
		let stopTime = STOPS_SEQUENCE[destTime[0]][j] + TIMES_SEQUENCE[destTime[1]][j];
		if ( filters.includes(stopTime) ) {
		  upcomingVoyages.push({ "date": (startIndex + i + 1) * 7200000, "destTime": destTime , "stop": j+1});
		  break;
		}
	  }
    } else {
      upcomingVoyages.push({ "date": (startIndex + i + 1) * 7200000, "destTime": destTime });
	}
  }

  return upcomingVoyages;
}