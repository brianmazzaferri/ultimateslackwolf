// Require the Bolt package (github.com/slackapi/bolt)
const { App } = require("@slack/bolt");

//boilerplate to start the app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

//code to setup test:
//find and archive any channel including wwtest

async function archiveWwtest() {
  try {
    const response = await app.client.conversations.list({
      token: process.env.SLACK_BOT_TOKEN,
      exclude_archived: true,
      limit: 1000
    });
    console.log(response);
    let channelArray = response.channels;
    await channelArray.forEach(async channel => {
      if (channel.name.startsWith("wwtest") && channel.is_archived == false) {
        const response2 = await app.client.conversations.archive({
          token: process.env.SLACK_BOT_TOKEN,
          channel: channel.id
        });
        console.log(response2);
      }
    });
  } catch (error) {
    console.error(error);
  }
}

//create new channel named wwtest
async function createNewTestChannel() {
  let newTestChanName = "wwtest" + Math.floor(Math.random() * 100000000000);
  const response = await app.client.conversations.create({
    token: process.env.SLACK_BOT_TOKEN,
    name: newTestChanName
  });
  let newTestChanId = response.channel.id;
  console.log(newTestChanId);
  const response2 = await app.client.conversations.invite({
    token: process.env.SLACK_BOT_TOKEN,
    channel: newTestChanId,
    users: "UUEPBE3D3, U011W2G9QDU, UUEQP1MPF, UU4P2UVBK, U0124HRHBU3"
  });
  console.log(response);
}

//run functions
archiveWwtest();
//add test users and werewolf bot

//boilerplate to start the app
/*(async () => {
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();*/
