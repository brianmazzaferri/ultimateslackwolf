// Require the Bolt package (github.com/slackapi/bolt)
const { App } = require("@slack/bolt");
const Datastore = require("nedb"), //(require in the database)
  // Security note: the database is saved to the file `datafile` on the local filesystem. It's deliberately placed in the `.data` directory
  // which doesn't get copied if someone remixes the project.
  db = new Datastore({ filename: ".data/datafile", autoload: true }); //initialize the database

//boilerplate to start the app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

//LISTENERS GO HERE

// When werewolf bot added to a channel, message channel with start game button
app.event("member_joined_channel", async ({ event, context }) => {
  try {
    let userName = await lookupPlayerName(event.user);
    if (userName === "Slackwolf Moderator") {
      const result = await app.client.chat.postMessage({
        token: context.botToken,
        channel: event.channel,
        text:
          "Once everyone is in the channel, click the button below to start!",
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text:
                "Once everyone is in the channel, click the button below to start!",
              emoji: true
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  emoji: true,
                  text: "Start Game"
                },
                style: "primary",
                value: "startgame",
                action_id: "startgame"
              }
            ]
          }
        ]
      });
    }
  } catch (error) {
    console.error(error);
  }
});

//listen for the start game button, and begin the game
app.action("startgame", async ({ ack, body, context }) => {
  ack();
  try {
    //hide start button
    let response4 = await app.client.chat.update({
      token: context.botToken,
      ts: body.message.ts,
      channel: body.channel.id,
      text:
        "*Let the game begin!* \n\n_The Rules_\nEach night, the werewolf will select someone to eat. Each day, the villagers will try to accuse and kill the werewolf. \nThe werewolf wins if they eat all the villagers. The villagers win if they catch and kill the werewolf.\n \nThere are also villagers with special powers: \nThe *bodyguard* chooses someone to protect each night, and they may not be eaten by the werewolf. \nThe *seer* chooses someone to investigate each night, and finds out if that person is a villager or a werewolf.",
      blocks: [
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*Let the game begin!* \n\n_The Rules:_\nEach night, the werewolf will select someone to eat. Each day, the villagers will try to accuse and kill the werewolf. \n\n _The Goal:_ \nThe werewolf wins if they eat all the villagers. The villagers win if they catch and kill the werewolf.\n\n_Special Powers:_ \nThere are two villagers with special powers: The *bodyguard* chooses someone to protect each night, and that person may not be eaten by the werewolf. The *seer* chooses someone to investigate each night, and finds out if that person is a villager or a werewolf."
          }
        },
        {
          type: "divider"
        }
      ]
    });

    //set gameid based on the channel
    const gameid = body.channel.id;
    //get user ids from the members of the channel when button is clicked
    const response = await app.client.conversations.members({
      token: context.botToken,
      channel: body.channel.id
    });
    //check if a game with this channel id already exists in the database, and if so, ignore this button push
    let gameexists = await queryOne({ datatype: "game", gameid: gameid });
    let werewolfBotId = await getWerewolfBotId();
    if (!gameexists) {
      //remove werewolf bot from players
      let players = response.members.filter(member => member !== werewolfBotId);
      //clear out the database for new game
      db.remove({}, { multi: true }, function(err) {
        if (err) console.log("There's a problem with the database: ", err);
        else console.log("database cleared");
      });

      //build player list into an array ready to be pushed into a database
      let playerArray = [];
      await players.forEach(async player => {
        const response3 = await app.client.users.profile.get({
          token: process.env.SLACK_BOT_TOKEN,
          user: player
        });
        await playerArray.push({
          datatype: "player",
          player: player,
          name: response3.profile.real_name,
          roll: Math.random(),
          gameid: gameid,
          status: "alive",
          role: "villager",
          spec: "none"
        });
        await console.log("playerPushed");
      });

      //JANK CITY TO USE SETTIMEOUT. FIX THIS AT SOME POINT
      setTimeout(async () => {
        //set werewolf id
        let w = 1;
        let wid;
        playerArray.forEach(player => {
          if (player.roll < w) {
            w = player.roll;
            wid = player.player;
          }
        });
        console.log("wid: " + wid);

        //insert data into database
        db.insert(playerArray, (err, newDoc) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (newDoc) console.log("initial player insert completed");
        });

        //update werewolf player's role
        db.update(
          { player: wid },
          { $set: { role: "werewolf" } },
          { returnUpdatedDocs: true },
          (err, numReplaced, affectedDocuments) => {
            if (err) console.log("There's a problem with the database: ", err);
            else if (numReplaced) console.log("werewolf assigned");
          }
        );

        //query players & set seer
        let villagers = await query({ role: "villager" });
        let s = 1;
        let sid;
        villagers.forEach(villager => {
          if (villager.roll < s) {
            s = villager.roll;
            sid = villager.player;
          }
        });

        db.update(
          { player: sid },
          { $set: { spec: "seer" } },
          (err, numReplaced) => {
            if (err) console.log("There's a problem with the database: ", err);
            else if (numReplaced) console.log("seer assigned");
          }
        );

        //query players & set bodyguard
        let villagers2 = await query({ role: "villager", spec: "none" });
        let b = 1;
        let bid;
        villagers2.forEach(villager => {
          if (villager.roll < b) {
            b = villager.roll;
            bid = villager.player;
          }
        });

        db.update(
          { player: bid },
          { $set: { spec: "bodyguard" } },
          (err, numReplaced) => {
            if (err) console.log("There's a problem with the database: ", err);
            else if (numReplaced) console.log("bodyguard assigned");
          }
        );

        //set up game "table" in the database
        let gameTable = {
          datatype: "game",
          gameid: gameid,
          round: 0,
          werewolves: 1,
          players: players.length,
          villagers: players.length - 1,
          channel: body.channel.id
        };

        //insert gameTable
        db.insert(gameTable, (err, newDoc) => {
          if (err) console.log("There's a problem with the database ", err);
          else if (newDoc) console.log("gameTable insert completed");
        });

        //set up roundTable
        let roundTable = {
          datatype: "round",
          round: 0,
          livingPlayers:
            (await countLivingVillagers()) + (await countLivingWerewolves()),
          votedPlayers: 0,
          accused: "",
          livevotes: 0,
          dievotes: 0,
          accusations: 0,
          accusationArray: [],
          accuserArray: [],
          status: "in progress",
          protected: ""
        };
        // insert round record
        await db.insert(roundTable, (err, docs) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (docs) console.log("round table inserted");
        });

        //distribute roles
        setTimeout(async () => {
          let playerArray = await query({ datatype: "player" });
          playerArray.forEach(async player => {
            await distributeRolesViaDM(player.player, player.role, player.spec);
          });
        }, 500);

        startNightRound();
      }, 500);
    }
  } catch (error) {
    console.error(error);
  }
});

//listen for the kill selection, and off someone
app.action("killSelect", async ({ ack, body, context }) => {
  ack();
  try {
    if (body.actions[0].block_id === (await getGameChannel())) {
      let eatenPerson = body.actions[0].selected_option.value;
      //call function to update their status in database to dead
      let currentRound = await queryOne({
        datatype: "round",
        status: "in progress"
      });
      printDatabase();
      if (eatenPerson !== currentRound.protected) {
        killVillager(eatenPerson);
      } else {
        eatenPerson = false;
      }
      let response = await app.client.chat.update({
        token: context.botToken,
        ts: body.message.ts,
        channel: body.channel.id,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Victim Selected"
            }
          }
        ]
      });
      startDayRound(eatenPerson);
    }
  } catch (error) {
    console.error(error);
  }
});

//listen for the bodyguard selection, and protect someone
app.action("bodyguardSelect", async ({ ack, body, context }) => {
  ack();
  try {
    if (body.actions[0].block_id === (await getGameChannel())) {
      let protectedPerson = body.actions[0].selected_option.value;
      let game = await queryOne({ datatype: "game" });
      //call function to mark them as protected
      protectVillager(protectedPerson, game.round);
      let response = await app.client.chat.update({
        token: context.botToken,
        ts: body.message.ts,
        channel: body.channel.id,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Protection Applied"
            }
          }
        ]
      });
      let seer = await queryOne({ spec: "seer" });
      if (seer.status === "alive") {
        sendSeerSelector();
      } else {
        sendKillSelector();
      }
    }
  } catch (error) {
    console.error(error);
  }
});

app.action("seerSelect", async ({ ack, body, context }) => {
  ack();
  try {
    if (body.actions[0].block_id === (await getGameChannel())) {
      let examinedPerson = body.actions[0].selected_option.value;
      let examinedData = await queryOne({ name: examinedPerson });
      let response = await app.client.chat.update({
        token: context.botToken,
        ts: body.message.ts,
        channel: body.channel.id,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Their role is: " + examinedData.role
            }
          }
        ]
      });
      console.log("investigation completed");
      sendKillSelector();
    }
  } catch (error) {
    console.error(error);
  }
});

//listen for an accusation, check to make sure the person isn't dead, and start the voting if accusations are done
app.action("accusationSelect", async ({ ack, body, context }) => {
  ack();
  try {
    //    db.update({datatype:"round",round:0},{$set:{status:"complete"}});
    let response4 = await app.client.chat.update({
      token: context.botToken,
      ts: body.message.ts,
      channel: body.channel.id,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Accusation leveled."
          }
        }
      ]
    });
    let accusedName = body.actions[0].selected_option.value;
    let accuserStatus = await checkAccuserStatus(body.user.id);
    //get roundTable
    let roundTable = await queryOne({
      datatype: "round",
      status: "in progress"
    });
    if (accuserStatus === "dead") {
      let response = await app.client.chat.postMessage({
        token: context.botToken,
        channel: body.user.id,
        text: "You can't accuse anyone, you're dead!"
      });
    } else if (roundTable.accuserArray.includes(body.user.id)) {
      let response = await app.client.chat.postMessage({
        token: context.botToken,
        channel: body.user.id,
        text: "You already accused someone!"
      });
    } else {
      let response = await app.client.chat.postMessage({
        token: context.botToken,
        channel: await getGameChannel(),
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                (await playerNameFromId(body.user.id)) +
                " has accused " +
                accusedName +
                " of being a Werewolf!"
            }
          }
        ]
      });
      roundTable.accusations++;
      roundTable.accusationArray.push(accusedName);
      roundTable.accuserArray.push(body.user.id);
      await updateRoundTable(roundTable);
      console.log(roundTable);
      console.log(
        (await countLivingVillagers()) + (await countLivingWerewolves())
      );
      if (
        roundTable.accusations ==
        (await countLivingVillagers()) + (await countLivingWerewolves())
      ) {
        //move on to full live/die voting
        let votesObj = {};
        roundTable.accusationArray.forEach(accused => {
          votesObj[accused] = 0;
        });
        roundTable.accusationArray.forEach(accused => {
          votesObj[accused] = votesObj[accused] + 1;
        });
        let response4 = await app.client.chat.postMessage({
          token: context.botToken,
          channel: await getGameChannel(),
          text: "*Accusations have been leveled!*",
          blocks: [
            {
              type: "divider"
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Accusations have been leveled!*"
              }
            },
            {
              type: "divider"
            }
          ]
        });
        let finalAccused;
        let finalAccusedVotes = 0;
        for (const property in votesObj) {
          let response = await app.client.chat.postMessage({
            token: context.botToken,
            channel: await getGameChannel(),
            text: `${property}: ${votesObj[property]} votes`
          });
          if (votesObj[property] > finalAccusedVotes) {
            finalAccusedVotes = votesObj[property];
            finalAccused = property;
          }
        }
        let runoffArray = [];
        runoffArray = getMax(votesObj);
        console.log(runoffArray);
        if (getMax(votesObj).length == 1) {
          let response3 = await app.client.chat.postMessage({
            token: context.botToken,
            channel: await getGameChannel(),
            text: `${finalAccused} stands accused of being a werewolf. They have 30 seconds to defend themselves, and then the village will vote on whether they live or die.`,
            blocks: [
              {
                type: "divider"
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    "*It's time to pass judgment!*\n" +
                    finalAccused +
                    " stands accused of being a werewolf. They have 30 seconds to defend themselves, and then the village will vote on whether they live or die."
                },
                accessory: {
                  type: "image",
                  image_url:
                    "https://img.freepik.com/free-vector/illustration-gavel_53876-28508.jpg?size=626&ext=jpg",
                  alt_text: "calendar thumbnail"
                }
              },
              {
                type: "divider"
              }
            ]
          });
          await updateAccusedInRoundTable(finalAccused);
          let livingVillagerArray = await getLivingVillagersPlusWerewolfId();
          setTimeout(() => {
            livingVillagerArray.forEach(player => {
              distributeVotingButtons(player.player, finalAccused);
            });
          }, 30000);
        } else {
          let killArray = [];
          runoffArray.forEach(villager => {
            let newOption = killOption(villager);
            killArray.push(newOption);
          });
          const response3 = await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: await getGameChannel(),
            text:
              "*The vote is tied!*\nThere will now be a runoff round of accusations. If there is another tie, the village does not kill anyone today and the next night round will begin.",
            blocks: [
              {
                type: "divider"
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    "*The vote is tied!*\nThere will now be a runoff round of accusations. If there is another tie, the village does not kill anyone today and the next night round will begin."
                },
                accessory: {
                  type: "image",
                  image_url:
                    "https://www.hubcityspokes.com/sites/default/files/styles/large/public/field/image/Runoff.png",
                  alt_text: "computer thumbnail"
                }
              },
              {
                type: "divider"
              }
            ]
          });
          let livingVillagerArray = await getLivingVillagersPlusWerewolfId();
          livingVillagerArray.forEach(player => {
            distributeAccusationButtons(
              player.player,
              killArray,
              "runoffSelect"
            );
          });
          console.log(roundTable);
          let runoffTable = roundTable;
          runoffTable.datatype = "runoff";
          runoffTable.accusations = 0;
          runoffTable.accusationArray = [];
          runoffTable.accuserArray = [];
          delete runoffTable._id;
          console.log(runoffTable);
          await db.insert(runoffTable, (err, docs) => {
            if (err) console.log("There's a problem with the database: ", err);
            else if (docs) console.log("runoff table inserted");
          });
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
});

//listen for a runoff accusation, check to make sure the person isn't dead, and start the voting
app.action("runoffSelect", async ({ ack, body, context }) => {
  ack();
  try {
    let response4 = await app.client.chat.update({
      token: context.botToken,
      ts: body.message.ts,
      channel: body.channel.id,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Accusation leveled."
          }
        }
      ]
    });
    let accusedName = body.actions[0].selected_option.value;
    let accuserStatus = await checkAccuserStatus(body.user.id);
    //get roundTable
    let roundTable = await queryOne({
      datatype: "runoff",
      status: "in progress"
    });
    if (accuserStatus === "dead") {
      let response = await app.client.chat.postMessage({
        token: context.botToken,
        channel: body.user.id,
        text: "You can't accuse anyone, you're dead!"
      });
    } else if (roundTable.accuserArray.includes(body.user.id)) {
      let response = await app.client.chat.postMessage({
        token: context.botToken,
        channel: body.user.id,
        text: "You already accused someone!"
      });
    } else {
      let response = await app.client.chat.postMessage({
        token: context.botToken,
        channel: body.channel.id,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                (await playerNameFromId(body.user.id)) +
                " has accused " +
                accusedName +
                " of being a Werewolf!"
            }
          }
        ]
      });
      roundTable.accusations++;
      roundTable.accusationArray.push(accusedName);
      roundTable.accuserArray.push(body.user.id);
      await updateRunoffTable(roundTable);
      console.log(roundTable);
      console.log(
        (await countLivingVillagers()) + (await countLivingWerewolves())
      );
      if (
        roundTable.accusations ==
        (await countLivingVillagers()) + (await countLivingWerewolves())
      ) {
        //move on to full live/die voting
        let response2 = await app.client.chat.update({
          token: context.botToken,
          ts: body.message.ts,
          channel: body.channel.id,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "Accusations concluded."
              }
            }
          ]
        });
        let votesObj = {};
        roundTable.accusationArray.forEach(accused => {
          votesObj[accused] = 0;
        });
        roundTable.accusationArray.forEach(accused => {
          votesObj[accused] = votesObj[accused] + 1;
        });
        let finalAccused;
        let finalAccusedVotes = 0;
        for (const property in votesObj) {
          let response = await app.client.chat.postMessage({
            token: context.botToken,
            channel: await getGameChannel(),
            text: `${property}: ${votesObj[property]} votes`
          });
          if (votesObj[property] > finalAccusedVotes) {
            finalAccusedVotes = votesObj[property];
            finalAccused = property;
          }
        }
        let runoffArray = [];
        runoffArray = getMax(votesObj);
        console.log(runoffArray);
        if (getMax(votesObj).length == 1) {
          let response3 = await app.client.chat.postMessage({
            token: context.botToken,
            channel: await getGameChannel(),
            text: `${finalAccused} stands accused of being a werewolf. They have 30 seconds to defend themselves, and then the village will vote on whether they live or die.`,
            blocks: [
              {
                type: "divider"
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    "*It's time to pass judgment!*\n" +
                    finalAccused +
                    " stands accused of being a werewolf. They have 30 seconds to defend themselves, and then the village will vote on whether they live or die."
                },
                accessory: {
                  type: "image",
                  image_url:
                    "https://img.freepik.com/free-vector/illustration-gavel_53876-28508.jpg?size=626&ext=jpg",
                  alt_text: "calendar thumbnail"
                }
              },
              {
                type: "divider"
              }
            ]
          });
          await updateAccusedInRoundTable(finalAccused);
          let livingVillagerArray = await getLivingVillagersPlusWerewolfId();
          setTimeout(() => {
            livingVillagerArray.forEach(player => {
              distributeVotingButtons(player.player, finalAccused);
            });
          }, 30000);
        } else {
          const response3 = await app.client.chat.postMessage({
            token: process.env.SLACK_BOT_TOKEN,
            channel: await getGameChannel(),
            text:
              "The village cannot decide on someone to accuse, so they decide not to kill anyone today."
          });
          startNightRound();
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
});

//listen for voting button pushes: remove buttons, broadcast vote to channel, tally vote, check if final vote
app.action("submitvote", async ({ ack, body, context }) => {
  ack();
  try {
    //remove buttons
    let response1 = await app.client.chat.update({
      token: context.botToken,
      ts: body.message.ts,
      channel: body.channel.id,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Vote Submitted"
          }
        }
      ]
    });
    //broadcast vote to channel
    if (body.actions[0].block_id === (await getGameChannel())) {
      let vote = body.actions[0].selected_option.value;
      const response = await app.client.chat.postMessage({
        token: context.botToken,
        channel: await getGameChannel(),
        text: (await playerNameFromId(body.user.id)) + " has voted " + vote
      });
      //tally vote in roundtable using (status = "in progress"). check if it was the last vote of the round
      tallyVote(vote);
      //end the round (check if person was the werewolf, end game if so, otherwise kill person and start next round)
    }
  } catch (error) {
    console.error(error);
  }
});

//FUNCTIONS BELOW HERE

//end day round
async function endDayRound(verdict) {
  if (verdict === "live") {
    let response = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getGameChannel(),
      text:
        "The village has spared " +
        (await getAccusedFromRoundTable()) +
        "'s life! But the Werewolf lives to strike again...",
      blocks: [
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*Mercy has been shown!*\nThe village has spared " +
              (await getAccusedFromRoundTable()) +
              "'s life! But the Werewolf lives to strike again..."
          },
          accessory: {
            type: "image",
            image_url:
              "https://i.pinimg.com/originals/97/1a/e6/971ae6ac9ff2e4216a66fbd117261fd1.jpg",
            alt_text: "computer thumbnail"
          }
        },
        {
          type: "divider"
        }
      ]
    });
    startNightRound();
  } else {
    let response = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getGameChannel(),
      text:
        "The village has chosen to kill " +
        (await getAccusedFromRoundTable()) +
        "!",
      blocks: [
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*The verdict is in!*\nThe village has chosen to kill " +
              (await getAccusedFromRoundTable()) +
              "!"
          },
          accessory: {
            type: "image",
            image_url:
              "https://previews.123rf.com/images/filkusto/filkusto1702/filkusto170200090/70972177-gallows-sketch-device-for-hanging-illustration-for-coloring.jpg",
            alt_text: "computer thumbnail"
          }
        },
        {
          type: "divider"
        }
      ]
    });
    await villageKillAccused();
  }
}

//village kills the accused
async function villageKillAccused() {
  let accused = await getAccusedFromRoundTable();
  let accusedRole = await getAccusedRole(accused);
  if (accusedRole === "werewolf") {
    endGame("village");
  } else {
    let response = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getGameChannel(),
      text: "Sadly, they were an innocent villager..."
    });
    await killVillager(accused);
    await startNightRound();
  }
}

//tally vote
async function tallyVote(vote) {
  //fetch currentRound table and update it
  let currentRound = await getCurrentRound();
  currentRound.votedPlayers++;
  if (vote === "live") currentRound.livevotes++;
  else if (vote === "die") currentRound.dievotes++;
  await updateRoundTable(currentRound);
  //check if it was the last vote of the round, and if so run endDayRound function
  console.log("ROUND TABLE CURRENTLY IS");
  console.log(currentRound);
  if (currentRound.votedPlayers == currentRound.livingPlayers) {
    let verdict;
    if (currentRound.livevotes >= currentRound.dievotes) {
      verdict = "live";
    } else {
      verdict = "die";
    }
    await endDayRound(verdict);
  }
}

//distribute roles via DM
async function distributeRolesViaDM(player, role, spec) {
  let roleBlocks;
  if (role === "villager" && spec === "none") {
    roleBlocks = [
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*You are a Villager!*\n Your goal is to work with the other villagers to find and kill the werewolf. You win if you catch the werewolf, and you lose if the werewolves eat all the villagers."
        },
        accessory: {
          type: "image",
          image_url:
            "https://image.shutterstock.com/image-vector/medieval-peasants-family-man-woman-260nw-1364869232.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      },
      		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "(Werewolf game <#" + await getGameChannel() + ">)"
				}
			]
		}
    ];
  }
  if (role === "werewolf") {
    roleBlocks = [
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*You are a Werewolf!*\n Your goal is to eat villagers at night and avoid being killed by the village during the day. You win if you eat all the villagers, and you lose if they catch and kill you."
        },
        accessory: {
          type: "image",
          image_url:
            "https://st4.depositphotos.com/1756323/21341/i/450/depositphotos_213414712-stock-photo-fantasy-werewolf-standing-rocky-cliff.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      },
      		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "(Werewolf game <#" + await getGameChannel() + ">)"
				}
			]
		}
    ];
  }
  if (role === "villager" && spec === "seer") {
    roleBlocks = [
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*You are a Seer!*\nYou are on the villagers' team, but you have a special power: each night, you will get to check on one other villager and find out if they are a werewolf."
        },
        accessory: {
          type: "image",
          image_url:
            "https://thumbs.dreamstime.com/b/retro-woodcut-style-illustration-fortune-teller-medium-psychic-mystic-seer-soothsayer-clairvoyant-scrying-crystal-ball-109430762.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      },
      		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "(Werewolf game <#" + await getGameChannel() + ">)"
				}
			]
		}
    ];
  }
  if (role === "villager" && spec === "bodyguard") {
    roleBlocks = [
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*You are a Bodyguard!*\n You are on the villagers' team, but you have a special power. Each night, you get to protect one person, and that person cannot be killed by the Werewolf."
        },
        accessory: {
          type: "image",
          image_url:
            "https://comps.canstockphoto.com/bodyguard-security-guard-vector-cartoon-vector-clip-art_csp67369111.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      }
    ];
  }

  const response = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: player,
    text: "Your role has been assigned",
    blocks: roleBlocks
  });
}

//distribute voting buttons via DM
async function distributeVotingButtons(player, name) {
  const response = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: player,
    text: "Time to vote! Should " + name + "live or die?",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Time to vote! Should " + name + " live or die?"
        }
      },
      {
        type: "actions",
        block_id: await getGameChannel(),
        elements: [
          {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "Select Live or Die",
              emoji: true
            },
            options: [
              {
                text: {
                  type: "plain_text",
                  text: "Live",
                  emoji: true
                },
                value: "live"
              },
              {
                text: {
                  type: "plain_text",
                  text: "Die",
                  emoji: true
                },
                value: "die"
              }
            ],
            action_id: "submitvote"
          }
        ]
      },
      		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "(Werewolf game <#" + await getGameChannel() + ">)"
				}
			]
		}
    ]
  });
}

//distribute accusation buttons via DM
async function distributeAccusationButtons(player, killArray, actionid) {
    const response2 = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: player,
    text: "Time to figure out who the werewolf is! Once you are ready to accuse someone, use the selector below"
  });
  const response = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: player,
    text: "When ready, accuse someone of being the werewolf",
    blocks: [
      {
        type: "actions",
        elements: [
          {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "When ready, accuse someone of being a werewolf"
            },
            options: killArray,
            action_id: actionid
          }
        ]
      },
      		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "(Werewolf game <#" + await getGameChannel() + ">)"
				}
			]
		}
    ]
  });
}

//start a new night round
async function startNightRound() {
  const response = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: await getGameChannel(),
    text:
      "*Night has fallen!*\n And while the village is asleep, the Werewolves are selecting their next victim...",
    blocks: [
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*Night has fallen!*\n And while the village is asleep, the Werewolves are selecting their next victim..."
        },
        accessory: {
          type: "image",
          image_url:
            "https://i-cf5.gskstatic.com/content/dam/cf-consumer-healthcare/excedrin/en_US/Article%20Teaser/2.3.8.Treat-nighttime-headaches-233x233.jpg?auto=format",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      }
    ]
  });
  let bodyguard = await queryOne({ spec: "bodyguard" });
  let seer = await queryOne({ spec: "seer" });
  if (bodyguard.status === "alive") {
    sendBodyguardSelector();
  } else if (seer.status === "alive") {
    sendSeerSelector();
  } else {
    sendKillSelector();
  }
}

//distribute bodyguard button
async function sendBodyguardSelector() {
  let livingVillagerArray = await getLivingVillagersPlusWerewolf();
  let killArray = [];
  livingVillagerArray.forEach(villager => {
    let newOption = killOption(villager.name);
    killArray.push(newOption);
  });
  setTimeout(async () => {
    let userid = await queryOne({ spec: "bodyguard" });
        const response3 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: userid.player,
      text: "It's time to use your power! Use the selector below to protect someone:"
    });
    const response2 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: userid.player,
      text: "Choose someone to protect tonight",
      blocks: [
        {
          type: "actions",
          block_id: await getGameChannel(),
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Choose someone to protect tonight"
              },
              options: killArray,
              action_id: "bodyguardSelect"
            }
          ]
        },
      		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "(Werewolf game <#" + await getGameChannel() + ">)"
				}
			]
		}
      ]
    });
  }, 1250);
}

//distribute seer button
async function sendSeerSelector() {
  let livingVillagerArray = await getLivingVillagersPlusWerewolf();
  let killArray = [];
  livingVillagerArray.forEach(villager => {
    let newOption = killOption(villager.name);
    killArray.push(newOption);
  });
  setTimeout(async () => {
    let userid = await queryOne({ spec: "seer" });
            const response3 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: userid.player,
      text: "It's time to use your power! Use the selector below to investigate someone:"
    });
    const response2 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: userid.player,
      text: "Choose someone to examine",
      blocks: [
        {
          type: "actions",
          block_id: await getGameChannel(),
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Choose someone to examine"
              },
              options: killArray,
              action_id: "seerSelect"
            }
          ]
        }
      ]
    });
  }, 1250);
}

//distribute kill button
async function sendKillSelector() {
  let livingVillagerArray = await getLivingVillagers();
  let killArray = [];
  livingVillagerArray.forEach(villager => {
    let newOption = killOption(villager.name);
    killArray.push(newOption);
  });
  setTimeout(async () => {
            const response4 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getWerewolf(),
      text: "It's time to dine! Use the selector below to eat someone:"
    });
    const response2 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getWerewolf(),
      text: "Choose someone to eat tonight",
      blocks: [
        {
          type: "actions",
          block_id: await getGameChannel(),
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Choose someone to eat tonight"
              },
              options: killArray,
              action_id: "killSelect"
            }
          ]
        },
      		{
			"type": "context",
			"elements": [
				{
					"type": "mrkdwn",
					"text": "(Werewolf game <#" + await getGameChannel() + ">)"
				}
			]
		}
      ]
    });
  }, 1000);
}

//start a new Day Round
async function startDayRound(deadPerson) {
  //function to advance the round
  advanceRound();
  //get living villagers for the message
  let livingVillagerArray = await getLivingVillagersPlusWerewolf();
  let livingVillagerIDs = await getLivingVillagersPlusWerewolfId();
  let killArray = [];
  livingVillagerArray.forEach(villager => {
    let newOption = killOption(villager.name);
    killArray.push(newOption);
  });
  let villagerArray = [];
  livingVillagerIDs.forEach(villager => {
    let newId = villager.player;
    villagerArray.push(newId);
  });
  //let everyone know who died, and present accusation selector
  let deadMessage = "testvalue";
  if (deadPerson) {
    deadMessage =
      "*Day has dawned!*\n But while the village slept, *" +
      deadPerson +
      "* was eaten by a Werewolf!\nIt's now up to the brave villagers to determine who among them committed this heinous crime.";
  } else {
    deadMessage =
      "*Day has dawned!*\n And as if by some miracle, no one has died in the night. But it's still up to the villagers to find the Werewolf before it's too late...";
  }
  const response = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: await getGameChannel(),
    text: deadMessage,
    blocks: [
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: deadMessage
        },
        accessory: {
          type: "image",
          image_url:
            "https://mlfjqdsf5ptg.i.optimole.com/q2nBJDA-GY0JOikK/w:330/h:330/q:69/dpr:2.6/https://n7jmr7muhj-flywheel.netdna-ssl.com/wp-content/uploads/2019/06/sunrise.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      }
    ]
  });
  //compare how many werewolves and villagers are still alive
  //and end the game if Werewolves equal or outnumber villagers
  let livingWerewolves = await countLivingWerewolves();
  let livingVillagers = await countLivingVillagers();
  if (livingWerewolves >= livingVillagers) {
    endGame("werewolves");
  } else {
    console.log("villagerArray:");
    console.log(villagerArray);
    villagerArray.forEach(player => {
      distributeAccusationButtons(player, killArray, "accusationSelect");
    });
  }
}

//append player names
async function lookupPlayerName(userid) {
  const response = await app.client.users.profile.get({
    token: process.env.SLACK_BOT_TOKEN,
    user: userid
  });
  return response.profile.real_name;
}

//find werewolf bot id
async function getWerewolfBotId() {
  const response = await app.client.users.list({
    token: process.env.SLACK_BOT_TOKEN,
    limit: 1000
  });
  let werewolfId;
  response.members.forEach(member => {
    if (member.real_name === "Slackwolf Moderator") {
      werewolfId = member.id;
    }
  });
  return werewolfId;
}

//game channel database lookup
function getGameChannel() {
  return new Promise((resolve, reject) => {
    db.findOne({ datatype: "game" }, { channel: 1, _id: 0 }, (err, docs) => {
      if (err) console.log("There's a problem with the database ", err);
      else if (docs) console.log("getGameChannel query completed");
      resolve(docs.channel);
    });
  });
}

//get Accused role database lookup
function getAccusedRole(accused) {
  return new Promise((resolve, reject) => {
    db.findOne(
      { datatype: "player", name: accused },
      { role: 1, _id: 0 },
      (err, docs) => {
        if (err) console.log("There's a problem with the database ", err);
        else if (docs) console.log("getAccusedRole query completed");
        resolve(docs.role);
      }
    );
  });
}

//accused roundTable database lookup
function getAccusedFromRoundTable() {
  return new Promise((resolve, reject) => {
    db.findOne(
      { datatype: "round", status: "in progress" },
      { accused: 1, _id: 0 },
      (err, docs) => {
        if (err) console.log("There's a problem with the database ", err);
        else if (docs) console.log("getAccusedFromRoundTable query completed");
        resolve(docs.accused);
      }
    );
  });
}

//werewolf database lookup returns user id
function getWerewolf() {
  return new Promise((resolve, reject) => {
    db.findOne({ role: "werewolf" }, { player: 1, _id: 0 }, (err, docs) => {
      if (err) console.log("There's a problem with the database ", err);
      else if (docs) console.log("getWerewolf query completed");
      resolve(docs.player);
    });
  });
}

//werewolf database lookup returns name
function getWerewolfName() {
  return new Promise((resolve, reject) => {
    db.findOne({ role: "werewolf" }, { name: 1, _id: 0 }, (err, docs) => {
      if (err) console.log("There's a problem with the database ", err);
      else if (docs) console.log("getWerewolfName query completed");
      resolve(docs.name);
    });
  });
}

//living villagers lookup returns names
function getLivingVillagers() {
  return new Promise((resolve, reject) => {
    db.find(
      { role: "villager", status: "alive" },
      { name: 1, _id: 0 },
      (err, docs) => {
        if (err) console.log("There's a problem with the database ", err);
        else if (docs) console.log("getLivingVillagers query completed");
        resolve(docs);
      }
    );
  });
}

//living villagers plus werewolf lookup return names
function getLivingVillagersPlusWerewolf() {
  return new Promise((resolve, reject) => {
    db.find({ status: "alive" }, { name: 1, _id: 0 }, (err, docs) => {
      if (err) console.log("There's a problem with the database ", err);
      else if (docs)
        console.log("getLivingVillagersPlusWerewolf query completed");
      resolve(docs);
    });
  });
}

//getMax (for use in identifying who got the most votes)
const getMax = object => {
  return Object.keys(object).filter(x => {
    return object[x] == Math.max.apply(null, Object.values(object));
  });
};

//living villagers plus werewolf lookup return user ids
function getLivingVillagersPlusWerewolfId() {
  return new Promise((resolve, reject) => {
    db.find(
      { status: "alive" },
      { player: 1, name: 1, role: 1, _id: 0 },
      (err, docs) => {
        if (err) console.log("There's a problem with the database ", err);
        else if (docs)
          console.log("getLivingVillagersPlusWerewolfId query completed");
        resolve(docs);
      }
    );
  });
}

//query current round
function getCurrentRound() {
  return new Promise((resolve, reject) => {
    db.findOne({ datatype: "round", status: "in progress" }, (err, docs) => {
      if (err) console.log("There's a problem with the database ", err);
      else if (docs) console.log("getCurrentRound query completed");
      resolve(docs);
    });
  });
}

//kill villager
function killVillager(name) {
  db.update(
    { name: name },
    { $set: { status: "dead" } },
    { returnUpdatedDocs: true },
    (err, numReplaced, affectedDocuments) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (numReplaced) console.log("villager killed");
    }
  );
}

function protectVillager(name, round) {
  db.update(
    { datatype: "round", round: round },
    { $set: { protected: name } },
    { returnUpdatedDocs: true },
    (err, numReplaced, affectedDocuments) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (numReplaced) console.log("villager protected");
    }
  );
}

//update accused in roundTable
function updateAccusedInRoundTable(name) {
  db.update(
    { datatype: "round", status: "in progress" },
    { $set: { accused: name } },
    (err, numReplaced) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (numReplaced) console.log("accused updated in roundTable");
    }
  );
}

//update roundTable
function updateRoundTable(data) {
  db.update(
    { datatype: "round", status: "in progress" },
    data,
    (err, numReplaced) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (numReplaced) console.log("roundTable updated");
    }
  );
}

//update runoffTable
function updateRunoffTable(data) {
  db.update(
    { datatype: "runoff", status: "in progress" },
    data,
    (err, numReplaced) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (numReplaced) console.log("runoffTable updated");
    }
  );
}

//print the whole database (for testing)
function printDatabase() {
  db.find({}, (err, data) => {
    if (err) console.log("There's a problem with the database: ", err);
    else if (data) console.log(data);
  });
}

//count Living Villagers left
function countLivingVillagers() {
  return new Promise((resolve, reject) => {
    db.count({ role: "villager", status: "alive" }, (err, count) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (count) console.log("living villagers :" + count);
      resolve(count);
    });
  });
}

//count Living Werewolves left
function countLivingWerewolves() {
  return new Promise((resolve, reject) => {
    db.count({ role: "werewolf", status: "alive" }, (err, count) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (count) console.log("living werewolves :" + count);
      resolve(count);
    });
  });
}

//check if Accuser is alive
function checkAccuserStatus(accuser) {
  return new Promise((resolve, reject) => {
    db.findOne({ player: accuser }, { status: 1, _id: 0 }, (err, docs) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (docs) console.log("accuser life check queried");
      resolve(docs.status);
    });
  });
}

//look up player name from user id
function playerNameFromId(id) {
  return new Promise((resolve, reject) => {
    db.findOne({ player: id }, { name: 1, _id: 0 }, (err, docs) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (docs) console.log("player name queried from id");
      resolve(docs.name);
    });
  });
}

//look up any one document from a query string
function queryOne(query) {
  return new Promise((resolve, reject) => {
    db.findOne(query, (err, docs) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (docs) console.log(query + " queryOne run successfully.");
      resolve(docs);
    });
  });
}

//look up from a query string
function query(query) {
  return new Promise((resolve, reject) => {
    db.find(query, (err, docs) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (docs) console.log(query + " query run successfully.");
      resolve(docs);
    });
  });
}

//advance round
async function advanceRound() {
  await db.findOne(
    { datatype: "game" },
    { round: 1, _id: 0 },
    async (err, docs) => {
      if (err) console.log("There's a problem with the database: ", err);
      else if (docs) console.log("game table round queried");
      let currentRound = docs.round;
      //update current round status to complete
      await db.update(
        { datatype: "round", round: currentRound },
        { $set: { status: "completed" } },
        { multi: false },
        (err, numReplaced) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced)
            console.log("round " + currentRound + " completed");
        }
      );
      // advance round in game record
      await db.update(
        { datatype: "game" },
        { $set: { round: currentRound + 1 } },
        { multi: false },
        (err, numReplaced) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced)
            console.log(numReplaced + " game round updated");
        }
      );
      // create new round record
      let roundTable = {
        datatype: "round",
        round: currentRound + 1,
        livingPlayers:
          (await countLivingVillagers()) + (await countLivingWerewolves()),
        votedPlayers: 0,
        accused: "",
        livevotes: 0,
        dievotes: 0,
        accusations: 0,
        accusationArray: [],
        accuserArray: [],
        status: "in progress",
        protected: ""
      };
      // insert round record
      await db.insert(roundTable, (err, docs) => {
        if (err) console.log("There's a problem with the database: ", err);
        else if (docs) console.log("round table inserted");
      });
      // close out runoff record
      await db.update(
        { datatype: "runoff", status: "in progress" },
        { $set: { status: "complete" } },
        (err, numReplaced) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced)
            console.log(numReplaced + " runoffTable updated");
        }
      );
    }
  );
}

//option constructor
function killOption(name) {
  return {
    text: {
      type: "plain_text",
      text: name
    },
    value: name
  };
}

//end game
async function endGame(winner) {
  if (winner === "village") {
    let response = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getGameChannel(),
      text:
        "*The Village Wins!*\n" +
        (await getWerewolfName()) +
        " was a werewolf! The werewolves have been vanquished, and the (surviving) villagers rejoice in their victory.",
      blocks: [
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*The Village Wins!*\n" +
              (await getWerewolfName()) +
              " was a werewolf! The werewolves have been vanquished, and the (surviving) villagers rejoice in their victory."
          },
          accessory: {
            type: "image",
            image_url: "https://i.redd.it/i3ggejqjq5221.jpg",
            alt_text: "computer thumbnail"
          }
        },
        {
          type: "divider"
        }
      ]
    });
  } else {
    let response = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getGameChannel(),
      text:
        "*The Werewolves Win!*\n" +
        (await getWerewolfName()) +
        " was the Werewolf, and they have succeeded in eating all of the Villagers",
      blocks: [
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*The Werewolves Win!*\n" +
              (await getWerewolfName()) +
              " was the Werewolf, and they have succeeded in eating all of the Villagers"
          },
          accessory: {
            type: "image",
            image_url:
              "https://img3.goodfon.com/wallpaper/big/1/25/oboroten-yarost-zuby-oskal.jpg",
            alt_text: "computer thumbnail"
          }
        },
        {
          type: "divider"
        }
      ]
    });
  }
}

//boilerplate to start the app
(async () => {
  await app.start(process.env.PORT || 3000);
  //console.log(await getWerewolfBotId());
  //printDatabase();
  console.log("⚡️ Bolt app is running!");
})();

/* TO DO LIST

bugs:
make sure nothing can get double-sent due to timeouts (e.g. starting the day round)
something funky going on with round advancing / numbering

ops:

v2:
add multiple werewolves
add start game modal where you choose how many roles exist


*/
