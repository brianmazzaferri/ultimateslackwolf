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

// Listen for new game shortcut, and pop modal
app.shortcut(
  "new_game_shortcut",
  async ({ shortcut, ack, context, client }) => {
    try {
      await ack();
      const result = await client.views.open({
        token: context.botToken,
        trigger_id: shortcut.trigger_id,
        view: {
          type: "modal",
          callback_id: "selectrolesbutton",
          title: {
            type: "plain_text",
            text: "Start A New Game",
            emoji: true
          },
          submit: {
            type: "plain_text",
            text: "Select Roles",
            emoji: true
          },
          close: {
            type: "plain_text",
            text: "Cancel",
            emoji: true
          },
          blocks: [
            {
              type: "divider"
            },
            {
              type: "input",
              block_id: "channelblock",
              element: {
                type: "plain_text_input",
                action_id: "channelname"
              },
              label: {
                type: "plain_text",
                text: "New Channel Name",
                emoji: true
              }
            },
            {
              type: "input",
              block_id: "usersblock",
              element: {
                type: "multi_users_select",
                action_id: "userstoadd",
                placeholder: {
                  type: "plain_text",
                  text: "Select users",
                  emoji: true
                }
              },
              label: {
                type: "plain_text",
                text: "Players",
                emoji: true
              }
            },
            {
              type: "divider"
            }
          ]
        }
      });
    } catch (error) {
      console.error(error);
    }
  }
);

app.view("selectrolesbutton", async ({ ack, body, view, context }) => {
  try {
    await ack();
    let userArray = view.state.values.usersblock.userstoadd.selected_users;
    //clear out the database for new game
    db.remove({}, { multi: true }, function(err) {
      if (err) console.log("There's a problem with the database: ", err);
      else console.log("database cleared");
    });
    //create a table to represent role selection
    let setupTable = {
      datatype: "setup",
      channelId: null,
      channelName: view.state.values.channelblock.channelname.value,
      userArray: userArray,
      villagers: userArray.length - 3,
      werewolves: 1,
      seers: 1,
      bodyguards: 1,
      players: userArray.length,
      balancescore: userArray.length + 1
    };
    //insert setupTable
    db.insert(setupTable, (err, newDoc) => {
      if (err) console.log("There's a problem with the database ", err);
      else if (newDoc) console.log("setupTable insert completed");
    });
    //build modal function, using role-setup-modal.json
    const modal = buildRoleSelectModal(
      setupTable.balancescore,
      setupTable.villagers,
      setupTable.werewolves,
      setupTable.seers,
      setupTable.bodyguards
    );
    const response2 = await app.client.views.open({
      token: context.botToken,
      trigger_id: body.trigger_id,
      view: modal
    });
  } catch (error) {
    console.log(error);
  }
});

app.action("addwerewolf", async ({ ack, body, context }) => {
  await ack();
  try {
    //query setupTable
    let setupTable = await queryOne({ datatype: "setup" });
    //run logic to ensure valid add, then change data and reinsert
    if (setupTable.villagers > 0) {
      setupTable.villagers--;
      setupTable.werewolves++;
      setupTable.balancescore = setupTable.balancescore - 7;
      db.update(
        { datatype: "setup" },
        setupTable,
        {},
        (err, numReplaced, affectedDocuments) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced) console.log("werewolf added");
        }
      );
      //call function to assemble modal
      const modal = buildRoleSelectModal(
        setupTable.balancescore,
        setupTable.villagers,
        setupTable.werewolves,
        setupTable.seers,
        setupTable.bodyguards
      );
      const response = await app.client.views.update({
        token: context.botToken,
        view_id: body.view.id,
        view: modal
      });
    }
  } catch (error) {
    console.error(error);
  }
});

app.action("addseer", async ({ ack, body, context }) => {
  await ack();
  try {
    //query setupTable
    let setupTable = await queryOne({ datatype: "setup" });
    //run logic to ensure valid add, then change data and reinsert
    if (setupTable.villagers > 0 && setupTable.seers == 0) {
      setupTable.villagers--;
      setupTable.seers++;
      setupTable.balancescore = setupTable.balancescore + 5;
      db.update(
        { datatype: "setup" },
        setupTable,
        {},
        (err, numReplaced, affectedDocuments) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced) console.log("seer added");
        }
      );
      //call function to assemble modal
      const modal = buildRoleSelectModal(
        setupTable.balancescore,
        setupTable.villagers,
        setupTable.werewolves,
        setupTable.seers,
        setupTable.bodyguards
      );
      const response = await app.client.views.update({
        token: context.botToken,
        view_id: body.view.id,
        view: modal
      });
    }
  } catch (error) {
    console.error(error);
  }
});

app.action("addbodyguard", async ({ ack, body, context }) => {
  await ack();
  try {
    //query setupTable
    let setupTable = await queryOne({ datatype: "setup" });
    //run logic to ensure valid add, then change data and reinsert
    if (setupTable.villagers > 0 && setupTable.bodyguards == 0) {
      setupTable.villagers--;
      setupTable.bodyguards++;
      setupTable.balancescore = setupTable.balancescore + 2;
      db.update(
        { datatype: "setup" },
        setupTable,
        {},
        (err, numReplaced, affectedDocuments) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced) console.log("bodyguard added");
        }
      );
      //call function to assemble modal
      const modal = buildRoleSelectModal(
        setupTable.balancescore,
        setupTable.villagers,
        setupTable.werewolves,
        setupTable.seers,
        setupTable.bodyguards
      );
      const response = await app.client.views.update({
        token: context.botToken,
        view_id: body.view.id,
        view: modal
      });
    }
  } catch (error) {
    console.error(error);
  }
});

app.action("removewerewolf", async ({ ack, body, context }) => {
  await ack();
  try {
    //query setupTable
    let setupTable = await queryOne({ datatype: "setup" });
    //run logic to ensure valid add, then change data and reinsert
    if (setupTable.werewolves > 1) {
      setupTable.villagers++;
      setupTable.werewolves--;
      setupTable.balancescore = setupTable.balancescore + 7;
      db.update(
        { datatype: "setup" },
        setupTable,
        {},
        (err, numReplaced, affectedDocuments) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced) console.log("werewolf removed");
        }
      );
      //call function to assemble modal
      const modal = buildRoleSelectModal(
        setupTable.balancescore,
        setupTable.villagers,
        setupTable.werewolves,
        setupTable.seers,
        setupTable.bodyguards
      );
      const response = await app.client.views.update({
        token: context.botToken,
        view_id: body.view.id,
        view: modal
      });
    }
  } catch (error) {
    console.error(error);
  }
});

app.action("removeseer", async ({ ack, body, context }) => {
  await ack();
  try {
    //query setupTable
    let setupTable = await queryOne({ datatype: "setup" });
    //run logic to ensure valid add, then change data and reinsert
    if (setupTable.seers > 0) {
      setupTable.villagers++;
      setupTable.seers--;
      setupTable.balancescore = setupTable.balancescore - 5;
      db.update(
        { datatype: "setup" },
        setupTable,
        {},
        (err, numReplaced, affectedDocuments) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced) console.log("seer removed");
        }
      );
      //call function to assemble modal
      const modal = buildRoleSelectModal(
        setupTable.balancescore,
        setupTable.villagers,
        setupTable.werewolves,
        setupTable.seers,
        setupTable.bodyguards
      );
      const response = await app.client.views.update({
        token: context.botToken,
        view_id: body.view.id,
        view: modal
      });
    }
  } catch (error) {
    console.error(error);
  }
});

app.action("removebodyguard", async ({ ack, body, context }) => {
  await ack();
  try {
    //query setupTable
    let setupTable = await queryOne({ datatype: "setup" });
    //run logic to ensure valid add, then change data and reinsert
    if (setupTable.bodyguards > 0) {
      setupTable.villagers++;
      setupTable.bodyguards--;
      setupTable.balancescore = setupTable.balancescore - 2;
      db.update(
        { datatype: "setup" },
        setupTable,
        {},
        (err, numReplaced, affectedDocuments) => {
          if (err) console.log("There's a problem with the database: ", err);
          else if (numReplaced) console.log("bodyguard removed");
        }
      );
      //call function to assemble modal
      const modal = buildRoleSelectModal(
        setupTable.balancescore,
        setupTable.villagers,
        setupTable.werewolves,
        setupTable.seers,
        setupTable.bodyguards
      );
      const response = await app.client.views.update({
        token: context.botToken,
        view_id: body.view.id,
        view: modal
      });
    }
  } catch (error) {
    console.error(error);
  }
});

//once the role setup modal has been submitted, begin the game
app.view("startgame", async ({ ack, body, view, context }) => {
  await ack();
  try {
    let setupTable = await queryOne({ datatype: "setup" });
    //game begin message
    const response = await app.client.conversations.create({
      token: context.botToken,
      name: setupTable.channelName
    });
    setupTable.channelId = response.channel.id;
    db.update({datatype:"setup"},setupTable);
    await setupTable.userArray.forEach(async user => {
      const response2 = await app.client.conversations.invite({
        token: context.botToken,
        channel: response.channel.id,
        users: user
      });
    });
    const response4 = await app.client.chat.postMessage({
      token: context.botToken,
      channel: setupTable.channelId,
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
    //remove werewolf bot from players
    let players = setupTable.userArray;

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
        gameid: setupTable.channelId,
        status: "alive",
        role: "villager",
        spec: "none"
      });
      await console.log("playerPushed");
      //insert playerArray into database
    });

    //JANK CITY TO USE SETTIMEOUT. FIX THIS AT SOME POINT
    setTimeout(async () => {
      await db.insert(playerArray, (err, newDoc) => {
        if (err) console.log("There's a problem with the database: ", err);
        else if (newDoc) console.log("initial player insert completed");
      });
      let villagers;
      //set werewolves
      let i;
      for (i = 0; i < setupTable.werewolves; i++) {
        villagers = await query({ role: "villager" });
        let w = 1;
        let wid;
        villagers.forEach(player => {
          if (player.roll < w) {
            w = player.roll;
            wid = player.player;
          }
        });
        console.log("wid: " + wid);

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
      }
      //query players & set seer
      for (i = 0; i < setupTable.seers; i++) {
        villagers = await query({ role: "villager" });
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
      }
      //query players & set bodyguard
      for (i = 0; i < setupTable.bodyguards; i++) {
        villagers = await query({ role: "villager", spec: "none" });
        let b = 1;
        let bid;
        villagers.forEach(villager => {
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
      }
      //set up game "table" in the database
      let gameTable = {
        datatype: "game",
        gameid: setupTable.channelId,
        round: 0,
        werewolves: setupTable.werewolves,
        players: setupTable.players,
        villagers: setupTable.villagers,
        channel: setupTable.channelId
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
      //create the werewolf channel
      updateWerewolfChannel();
      startNightRound();
    }, 500);
  } catch (error) {
    console.error(error);
  }
});

//listen for the kill selection, and off someone
app.action("killSelect", async ({ ack, body, context }) => {
  await ack();
  try {
    if (body.actions[0].block_id === (await getGameChannel())) {
      let eatenPerson = body.actions[0].selected_option.value;
      //call function to update their status in database to dead
      let currentRound = await queryOne({
        datatype: "round",
        status: "in progress"
      });
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
  await ack();
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
      if (!seer){
        seer = {status:"none"}
      }
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
  await ack();
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
  await ack();
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
        text:
          (await playerNameFromId(body.user.id)) +
          " has accused " +
          accusedName +
          " of being a Werewolf!",
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
            text: `${finalAccused} stands accused of being a werewolf. They should now offer their last statement, and the village will vote on whether they live or die.`,
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
                    " stands accused of being a werewolf. They should now offer their last statement, and the village will vote on whether they live or die."
                },
                accessory: {
                  type: "image",
                  image_url: "https://i.imgur.com/WU8mD4R.jpg",
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
          livingVillagerArray.forEach(player => {
            distributeVotingButtons(player.player, finalAccused);
          });
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
                  image_url: "https://i.imgur.com/2Bmy8M7.jpg",
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
  await ack();
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
        channel: await getGameChannel(),
        text:
          (await playerNameFromId(body.user.id)) +
          " has accused " +
          accusedName +
          " of being a Werewolf!",
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
            text: `${finalAccused} stands accused of being a werewolf. They may now make their last statement, and then the village will vote on whether they live or die.`,
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
                    " stands accused of being a werewolf. They may now make their last statement, and then the village will vote on whether they live or die."
                },
                accessory: {
                  type: "image",
                  image_url: "https://i.imgur.com/WU8mD4R.jpg",
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
          livingVillagerArray.forEach(player => {
            distributeVotingButtons(player.player, finalAccused);
          });
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
  await ack();
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

//build role selection modal
function buildRoleSelectModal(score, villagers, werewolves, seers, bodyguards) {
  const obj = require("./modals/role-setup-modal");
  //set gamescore
  obj.blocks[1].text.text = "*Current Game Balance Score: " + score + "*";
  //set villager text
  obj.blocks[3].text.text =
    "*Villagers : " +
    villagers +
    "*\nThe standard good role, these players have no special powers. Their goal is to catch and kill the werewolf, while avoiding killing innocents.\n_+1 Points Each_";
  //set werewolf text
  obj.blocks[5].text.text =
    "*Werewolves : " +
    werewolves +
    "*\nThe standard bad role, these players will be trying to eat the villagers and lying through their teeth the whole game. \n_-6 Points Each_";
  //set seer text
  obj.blocks[8].text.text =
    "*Seers : " +
    seers +
    "*\nThese are special villagers who have the power to investigate one other living player per round to find out if they're a werewolf.\n_+7 Points Each (Maximum 1)_";
  //set bodyguard text
  obj.blocks[11].text.text =
    "*Bodyguards : " +
    bodyguards +
    "*\nThese are special villagers who have the power to protect one other living player each night, preventing them from being eaten.\n_+3 Points Each (Maximum 1)_";
  return obj;
}

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
            image_url: "https://i.imgur.com/C4H0Xp6.jpg",
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
            image_url: "https://i.imgur.com/LPCVU2L.jpg",
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
  let livingWerewolves = await query({role:"werewolf",status:"alive"});
  if (accusedRole === "werewolf" && livingWerewolves.length == 1) {
    let response3 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getGameChannel(),
      text: "They were indeed a werewolf!! Which means that..."
    });
    endGame("village");
  } else if (accusedRole === "werewolf"){
    let response2 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await getGameChannel(),
      text: "They were indeed a werewolf!! But they weren't the last one..."
    });
    await killVillager(accused);
    await startNightRound();
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
          image_url: "https://i.imgur.com/q7k9WWT.png",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
          image_url: "https://i.imgur.com/uZmxflH.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
          image_url: "https://i.imgur.com/OP4kL3n.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
          image_url: "https://i.imgur.com/8DajcpK.jpg",
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
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
    text:
      "Time to figure out who the werewolf is! Once you are ready to accuse someone, use the selector below"
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
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
          image_url: "https://i.imgur.com/KBQLthQ.jpg",
          alt_text: "calendar thumbnail"
        }
      },
      {
        type: "divider"
      }
    ]
  });
  let bodyguard = await queryOne({ spec: "bodyguard" });
  console.log("BODYGUARD");
  console.log(bodyguard);
  if (!bodyguard){
    bodyguard = {status:"none"};
  }
  console.log(bodyguard);
  let seer = await queryOne({ spec: "seer" });
  if (!seer){
    seer = {status:"none"};
  }
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
      text:
        "It's time to use your power! Use the selector below to protect someone:"
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
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
      text:
        "It's time to use your power! Use the selector below to investigate someone:"
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
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
      channel: await updateWerewolfChannel(),
      text: "It's time to dine! Use the selector below to eat someone:"
    });
    const response2 = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: await updateWerewolfChannel(),
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
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "(Werewolf game <#" + (await getGameChannel()) + ">)"
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
          image_url: "https://i.imgur.com/OM6141j.png",
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

//werewolf database lookup returns user id (no longer used??)
/*function getWerewolf() {
  return new Promise((resolve, reject) => {
    db.findOne({ role: "werewolf" }, { player: 1, _id: 0 }, (err, docs) => {
      if (err) console.log("There's a problem with the database ", err);
      else if (docs) console.log("getWerewolf query completed");
      resolve(docs.player);
    });
  });
}*/

//werewolf database lookup returns names
async function getWerewolfNames() {
  let werewolves = await query({role:"werewolf"});
  let werewolfNameArray = [];
  werewolves.forEach(wolf => {
    werewolfNameArray.push(wolf.name);
  });
  return werewolfNameArray.join();
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
        "*The Village Wins!*\nThe werewolves have been vanquished, and the (surviving) villagers rejoice in their victory. The werewolves were:\n"+await getWerewolfNames(),
      blocks: [
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*The Village Wins!*\nThe werewolves have been vanquished, and the (surviving) villagers rejoice in their victory. The werewolves were:\n"+await getWerewolfNames()
          },
          accessory: {
            type: "image",
            image_url: "https://i.imgur.com/hHiwNld.jpg",
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
        "*The Werewolves Win!*\nThese were the Werewolves, and they have succeeded in eating all of the Villagers:\n"+await getWerewolfNames(),
      blocks: [
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*The Werewolves Win!*\nThese were the Werewolves, and they have succeeded in eating all of the Villagers:\n"+await getWerewolfNames()
          },
          accessory: {
            type: "image",
            image_url: "https://i.imgur.com/nYtXJgW.jpg",
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

//update werewolf channel
async function updateWerewolfChannel() {
  let werewolves = await query({role:"werewolf",status:"alive"});
  let werewolfArray = [];
  werewolves.forEach(wolf => {
    werewolfArray.push(wolf.player);
  });
  const response = await app.client.conversations.open({
    token:process.env.SLACK_BOT_TOKEN,
    return_im:false,
    users: werewolfArray.join()
  });
  console.log(response.channel.id);
  let gameTable = await queryOne({datatype:"game"});
  gameTable.werewolfChannel = response;
  await db.update({datatype:"game"},gameTable);
  return response.channel.id;
}

//boilerplate to start the app
(async () => {
  await app.start(process.env.PORT || 3000);
  //villageKillAccused();
  //printDatabase();
  console.log("⚡️ Bolt app is running!");
})();

/* TO DO LIST

bugs:
make sure nothing can get double-sent due to timeouts (e.g. starting the day round) (maybe resolved using plus?)

ops:

v2:
segment database to work with multiple channels

refactor/cleanup:
abstract database queries further
reduce redundancies between accusationSelect and runoffSelect
make sure the round table actually writes to the correct round
abstract big / reused blocks (runoff stuff?) into JSON files

*/
