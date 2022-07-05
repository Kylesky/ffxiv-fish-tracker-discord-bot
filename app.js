import DATA from "./data.js";
import FISH_INFO from "./fish_info_data.js";

import eorzeaTime from "./time.js";
import fishes from "./fish.js";
import weatherService from "./weather.js";
import fishWatcher from "./fishwatcher.js";

import _ from "underscore";
import * as dateFns from "date-fns";
import { Client, Intents } from "discord.js";
const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
});
import config from "./config.js";

const SCOUT_COUNT = 20;
// let rangesPrecomputed = false;
client.on("messageCreate", (message) => {
  // Exit and stop if the prefix is not there or if user is a bot
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;
  
  const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();
  
  try{
	  switch (command) {
		case "fishcheck":
		  let fishName = args.join(" ");
		  let info = FISH_INFO.find(o => o.name_en.localeCompare(fishName, undefined, {sensitivity: 'base'}) === 0);
		  if(!info){
			  message.channel.send(fishName + " not found");
			  break;
		  }
		  
		  let fish = fishes.find(o => o.id === info.id);
		  fishWatcher.updateRangesForFish(fish);
		  
		  console.log(fish);
		  
		  let description = "Next 5 windows:\n";
		  for(let i=0; i < 5; i++){
			  let start = eorzeaTime.toEarth(fish.catchableRanges[i].start)/1000;
			  let end = eorzeaTime.toEarth(fish.catchableRanges[i].end)/1000;
			  let difference = (end-start)/60;
			  description += "<t:"+ start + "> - <t:" + end + "> (" + difference.toFixed(2) + " minutes)\n";
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
		  let uptimeList = [];
		  
		  // if(!rangesPrecomputed){
			// message.channel.send("Please wait for first time computation of fish windows...");
			// rangesPrecomputed = true;
		  // }
		  
		  for(let i=0; i<fishes.length; i++){
			  if(fishes[i].catchableRanges.length == 0){
				fishWatcher.updateRangesForFish(fishes[i]);
			  }
			  
			  uptimeList.push({uptime: fishes[i].uptime(), fish: fishes[i]});
		  }
		  
		  uptimeList.sort((a, b) => a.uptime - b.uptime);
		  
		  let dayLength = 24*60*60*1000;
		  let timestampThreshold = Date.now() + dayLength;
		 
		  let rareFish = [];
		  for(let i=0; rareFish.length < SCOUT_COUNT; i++){
			  if(eorzeaTime.toEarth(uptimeList[i].fish.catchableRanges[0].start) <= timestampThreshold){
				  rareFish.push(uptimeList[i].fish);
			  }
		  }
		  
		  let return_message = SCOUT_COUNT + " rarest fish with windows in the next 24 hours.\n"
		  for(let i=0; i<SCOUT_COUNT; i++){
			  fishWatcher.updateRangesForFish(rareFish[i]);
			  return_message += rareFish[i].name + " - ";
			  
			  for(let j=0; j<rareFish[i].catchableRanges.length; j++){
				  let start = eorzeaTime.toEarth(rareFish[i].catchableRanges[j].start);
				  
				  if(start > timestampThreshold) break;
				  if(j == 0){
					  return_message += "<t:"+ start/1000 + ">";
				  } else {
					  return_message += ", <t:"+ start/1000 + ">";
				  }
			  }
			  return_message += "\n";
		  }
		  
		  message.channel.send(return_message);
	  }
  } catch (err) {
	  message.channel.send(err.stack);
  }

});

client.login(config.token);