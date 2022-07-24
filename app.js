import DATA from "./data.js";
import FISH_INFO from "./fish_info_data.js";

import eorzeaTime from "./time.js";
import fishes from "./fish.js";
import weatherService from "./weather.js";
import fishWatcher from "./fishwatcher.js";

import OCEAN_FISH_DATA from "./ocean-fish-data.js";
import calculateVoyages from "./calculate-voyages.js";

import _ from "underscore";
import * as dateFns from "date-fns";
import { Client, Intents } from "discord.js";
const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
});
import config from "./config.js";

var rangesPrecomputed = false;
var fishSets = [ 
	{"name": "Of Dragons Deep", "fish": ["Titanic Sawfish", "Navigator's Brand", "Helicoprion", "Endoceras", "Namitaro", "Shonisaurus", "Kuno the Killer", "Nepto Dragon"]}
];

var filters = [
	{"name": "A Realm Reborn", "aliases": ["ARR"], "filters": {"expac": 2}},
	{"name": "Heavensward", "aliases": ["HW"], "filters": {"expac": 3}},
	{"name": "Stormblood", "aliases": ["SB"], "filters": {"expac": 4}},
	{"name": "Shadowbringers", "aliases": ["SHB"], "filters": {"expac": 5}},
	{"name": "Endwalker", "aliases": ["EW"], "filters": {"expac": 6}}
];

function checkNameOrAlias(name, object){
  if(object.name.localeCompare(name, undefined, {sensitivity: 'base'}) === 0) return true;
  if(object.aliases){
	  for(let i=0; i<object.aliases.length; i++){
		  if(object.aliases[i].localeCompare(name, undefined, {sensitivity: 'base'}) === 0) return true;
	  }
  }
  return false;
};

function timeDiffToString(diff){
	if(diff >= 24*60*60){
		let d = (~~(diff/(24*60*60)));
		if(d==1){ return "1 day"; }
		else { return d + " days"; }
	}else if(diff >= 60*60){
		let d = (~~(diff/(60*60)));
		if(d==1){ return "1 hour"; }
		else { return d + " hours"; }
	}else if(diff >= 60){
		let d = (~~(diff/(60)));
		if(d==1){ return "1 minute"; }
		else { return d + " minutes"; }
	}else{
		let d = (~~(diff));
		if(d==1){ return "1 second"; }
		else { return d + " seconds"; }
	}
}

function getOceanFishCheckMessage(name, data){
	let timeNow = Date.now();
	let filters = [];
	for(let i=0; i<data.time.length; i++){
		filters.push("" + data.locShort + data.time[i]);
	}
	
	let voyages = calculateVoyages(Date.now(), 5, filters);
		
	let description = "";
	let nextStart = voyages[0].date/1000;
	let diff = 0;

	if(timeNow/1000 > nextStart){
		description += "Ocean fishing voyage currently ongoing.\n";
	}else{
		diff = ~~(nextStart-(timeNow/1000));
		description += "Next voyage starts in: " + timeDiffToString(diff) + "\n";
	}
  
	description += "\n";

	description += "Next 5 voyages:\n";
	for(let i=0; i < 5; i++){
		let start = voyages[i].date/1000;
		description += "<t:"+ (~~start) + "> (Stop " + voyages[i].stop + ")\n";
	}
	description += "\nBait Path:\n";

	if(data.mooch){
		let moochFishData = OCEAN_FISH_DATA.find(o => checkNameOrAlias(data.mooch, o));
		description += moochFishData.bait + " ";
		for(let i=0; i<moochFishData.tug; i++){
			description += "!";
		}
		description += " - " + moochFishData.hookset + "\n";
		
		description += data.mooch + " ";
		for(let i=0; i<data.tug; i++){
			description += "!";
		}
		description += " - " + data.hookset + "\n";
	}else{
		description += data.bait + " ";
		for(let i=0; i<data.tug; i++){
			description += "!";
		}
		description += " - " + data.hookset + "\n";
	}
	
	if(data.intuition){
		description += "\nIntuition:\n";
		for(let i=0; i<data.intuition.length; i++){
			let intuitionFishData = OCEAN_FISH_DATA.find(o => checkNameOrAlias(data.intuition[i].name, o));
			if(intuitionFishData.mooch){
				let moochFishData = OCEAN_FISH_DATA.find(o => checkNameOrAlias(intuitionFishData.mooch, o));
				description += data.intuition[i].count + " " + data.intuition[i].name + " - " + intuitionFishData.mooch + " - " + moochFishData.bait + "\n";
			}else{
				description += data.intuition[i].count + " " + data.intuition[i].name + " - " + intuitionFishData.bait + "\n";
			}
		}
	}
  
  let returnEmbed = {
	  title: data.name + " (" + data.location + ")",
	  description: description
  };
  
  console.log(returnEmbed);
  
  return returnEmbed;
};

const SCOUT_COUNT = 20;

client.on("messageCreate", (message) => {
  // Exit and stop if the prefix is not there or if user is a bot
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;
  
  const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();
  
  let dayLength = 24*60*60*1000;
  let timeNow = Date.now();
  let timestampThreshold = timeNow + dayLength;
  let return_message;
  
  try{
	  switch (command) {
		case "fishcheck":
		  let fishName = args.join(" ");
		  let data = OCEAN_FISH_DATA.find(o => o.name.localeCompare(fishName, undefined, {sensitivity: 'base'}) === 0);
		  if(data){
			  let returnEmbed = getOceanFishCheckMessage(fishName, data);
			  message.channel.send({embeds: [returnEmbed]});
			  break;
		  }
		  
		  let info = FISH_INFO.find(o => o.name_en.localeCompare(fishName, undefined, {sensitivity: 'base'}) === 0);
		  if(!info){
			  message.channel.send(fishName + " not found");
			  break;
		  }
		  
		  let fish = fishes.find(o => o.id === info.id);
		  if(!fish){
			  message.channel.send(info.name_en + " is not tracked");
			  break;
		  }
		  
		  fishWatcher.updateRangesForFish(fish);
		  
		  console.log(fish);
		  
		  let description = "";
		  let nextStart = eorzeaTime.toEarth(fish.catchableRanges[0].start)/1000;
		  let nextEnd = eorzeaTime.toEarth(fish.catchableRanges[0].end)/1000;
		  let diff = 0;
		  
		  if(fish.startHour == 0 && fish.endHour == 24 && fish.weatherSet.length == 0){
			  description += "Fish is always up.\n";
		  }else if(timeNow/1000 > nextStart){
			  diff = ~~(nextEnd-(timeNow/1000));
			  description += "Current window ends in: " + timeDiffToString(diff) + "\n";
		  }else{
			  diff = ~~(nextStart-(timeNow/1000));
			  description += "Next window starts in: " + timeDiffToString(diff) + "\n";
		  }
		  
		  if(fish.startHour == 0 && fish.endHour == 24){
			description += "All day";
		  }else{
			description += fish.startHour + " - " + fish.endHour + " ET";
		  }
		  
		  if(fish.weatherSet.length != 0){
			  description += " | ";
			  if(fish.previousWeatherSet.length != 0){
				  for(let i=0; i<fish.conditions.previousWeatherSet.length; i++){
					  if(i != 0){
						  description += ", ";
					  }
					  description += fish.conditions.previousWeatherSet[i].name_en;
				  }
				  description += " -> ";
			  }
			  for(let i=0; i<fish.conditions.weatherSet.length; i++){
				  if(i != 0){
					  description += ", ";
				  }
				  description += fish.conditions.weatherSet[i].name_en;
			  }
		  }
		  
		  description += "\n";
		  
		  if(fish.startHour != 0 || fish.endHour != 24 || fish.weatherSet.length != 0){
			  description += "\nNext 5 windows:\n";
			  for(let i=0; i < 5; i++){
				  let start = eorzeaTime.toEarth(fish.catchableRanges[i].start)/1000;
				  let end = eorzeaTime.toEarth(fish.catchableRanges[i].end)/1000;
				  let difference = (end-start)/60;
				  description += "<t:"+ (~~start) + "> - <t:" + (~~end) + "> (" + difference.toFixed(2) + " minutes)\n";
			  }
		  }
		  
		  
		  description += "\nBait Path:\n";
		  
		  for(let i=0; i<fish.bait.path.length; i++){
			  let nextFishData;
			  if(i == fish.bait.path.length-1){
				  nextFishData = fish;
			  } else {
				  nextFishData = _(fishes).findWhere({id: fish.bait.path[i+1]._id});
			  }
			  
			  description += fish.bait.path[i].name_en + " ";
			  switch(nextFishData.tug){
				  case "light":
					description += "!";
					break;
				  case "medium":
					description += "!!";
					break;
				  case "heavy":
					description += "!!!";
					break;
			  }
			  description += " - " + nextFishData.hookset + "\n";
		  }
		  
		  if(fish.intuitionLength){
			  description += "\nIntuition: " + fish.intuitionLength + "s\n";
			  for(let i=0; i<fish.intuitionFish.length; i++){
				description += fish.intuitionFish[i].count + " " + fish.intuitionFish[i].data.name + " - " + fish.intuitionFish[i].data.bait.path[0].name_en + "\n";  
			  }
		  }
		  
		  let returnEmbed = {
			  title: fish.name + " (" + fish.location.name + " - " + fish.location.zoneName + ")",
			  url: "https://ffxivteamcraft.com/db/en/fishing-spot/" + fish.location.id,
			  description: description
		  };
		  
		  console.log(returnEmbed);
		  
		  message.channel.send({embeds: [returnEmbed]});
		  break;
		  
		case "fishscout":
		  let filterName = args.join(" ");
		  let uptimeList = [];
		  
		  if(!rangesPrecomputed){
			message.channel.send("Fish rarity still computing. Please try again later...");
			break;
		  }
		  
		  let filter;
		  if(filterName.trim() != ""){
			  filter = filters.find(o => checkNameOrAlias(filterName, o));
		  }
		  
		  for(let i=0; i<fishes.length; i++){
			  if(filter) {
				  if(filter.filters.expac){
					  if(Math.trunc(fishes[i].patch) != filter.filters.expac) continue;
				  }
			  }
			  
			  if(fishes[i].catchableRanges.length == 0){
				fishWatcher.updateRangesForFish(fishes[i]);
			  }
			  
			  uptimeList.push({uptime: fishes[i].uptime(), fish: fishes[i]});
		  }
		  
		  uptimeList.sort((a, b) => a.uptime - b.uptime);
		 
		  let rareFish = [];
		  for(let i=0; rareFish.length < SCOUT_COUNT && i < uptimeList.length; i++){
			  fishWatcher.updateRangesForFish(uptimeList[i].fish);
			  if(eorzeaTime.toEarth(uptimeList[i].fish.catchableRanges[0].start) <= timestampThreshold){
				  rareFish.push(uptimeList[i].fish);
			  }
		  }
		  
		  return_message = rareFish.length + " rarest fish with windows in the next 24 hours";
		  if(filter){
			  return_message += " (" + filter.name + ")";
		  }
		  return_message += ".\n";
		  for(let i=0; i<rareFish.length; i++){
			  return_message += rareFish[i].name + " - ";
			  
			  for(let j=0; j<rareFish[i].catchableRanges.length && j < 5; j++){
				  let start = eorzeaTime.toEarth(rareFish[i].catchableRanges[j].start);
				  
				  if(start > timestampThreshold) break;
				  if(j == 0){
					  return_message += "<t:"+ (~~(start/1000)) + ">";
				  } else {
					  return_message += ", <t:"+ (~~(start/1000)) + ">";
				  }
			  }
			  return_message += "\n";
		  }
		  
		  message.channel.send(return_message);
		  break;
		  
	    case "fishsetcheck":
		  let fishSetName = args.join(" ");
		  
		  if (fishSetName.charAt(0) === '"' && fishSetName.charAt(fishSetName.length-1) === '"'){
			fishSetName = fishSetName.substr(1,fishSetName.length-2);
		  }
		  
		  let fishSet = fishSets.find(o => checkNameOrAlias(fishSetName, o));
		  
		  if(!fishSet){
			  message.channel.send(fishSetName + " not found");
			  break;
		  }
		  
		  let fishList;
		  if(fishSet.fish){
			  fishList = [];
			  for(let i=0; i<fishSet.fish.length; i++){
				  fishList.push(fishes.find(o => o.name === fishSet.fish[i]));
			  }
		  }else if(fishSet.filters){
			  // fishList = fishes.filter(function(fish) {
				  // if(fishSet.filters.expac){
					  // if(Math.trunc(fish.patch) != fishSet.filters.expac) return false;
				  // }
				  
				  // return true;
			  // });
		  }
		  
		  return_message = "Upcoming windows within 24 hours for " + fishSet.name + ":\n";
		  for(let i=0; i<fishList.length; i++){
			  let fish = fishList[i];
			  fishWatcher.updateRangesForFish(fish);
			  return_message += fish.name + " - ";
			  
			  if(eorzeaTime.toEarth(fish.catchableRanges[0].start) <= timestampThreshold){
				  for(let j=0; j<fish.catchableRanges.length; j++){
					  let start = eorzeaTime.toEarth(fish.catchableRanges[j].start);
					  
					  if(start > timestampThreshold) break;
					  if(j == 0){
						  return_message += "<t:" + (~~(start/1000)) + ">";
					  } else {
						  return_message += ", <t:" + (~~(start/1000)) + ">";
					  }
				  }
				return_message += "\n";
			  }
		  }
		  
		  message.channel.send(return_message);
		  break;
		
		// case "oceanfishvoyages":
		  // return_message = "Upcoming voyages:\n";
		  
		  // let voyages = calculateVoyages(Date.now(), 10, null);
		  // for(let i=0; i<voyages.length; i++){
			  // return_message += "<t:" + (~~(voyages[i].date/1000)) + "> " + voyages[i].destTime + "\n";
		  // }
		  
		  // message.channel.send(return_message);
		  // break;
	  }
  } catch (err) {
	  message.channel.send(err.stack);
  }

});

client.on("ready", () => {
	console.log("Precomputing catchable ranges for " + fishes.length + " fish...");

	for(let i=0; i<fishes.length; i++){
		if(i%100 == 0){
			console.log("Computed for " + i + " fish");
		}
		
		if(fishes[i].catchableRanges.length == 0){
			fishWatcher.updateRangesForFish(fishes[i]);
		}
	}

	console.log("Precomputing done...");
	rangesPrecomputed = true;
});

client.login(config.token);
