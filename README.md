# Pixel Bot

A Discord bot with games, moderation tools and handy utilities. Written in JavaScript with [discord.js](https://discord.js.org).

This guide assumes you have never made a bot before. Setup takes about 15 minutes and you only do it once.

---

## Setup

### 1. Install Node.js

Node.js is the program that runs the bot's code.

1. Go to <https://nodejs.org> and download the **LTS** version.
2. Run the installer and accept the defaults.

### 2. Create the bot on Discord

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and log in.
2. Click **New Application**, name it `Pixel Bot`, and create it.
3. In the left menu, click **Bot**.
4. Scroll to **Privileged Gateway Intents** and turn on both of these, then save:
   - **Server Members Intent** (needed for welcome messages)
   - **Message Content Intent** (needed for the word filter)
5. Near the top of the same page, click **Reset Token**, then **Copy**. You'll paste it in the next step.

> **Your token is a password.** Anyone who has it can control your bot. Never post it or share it. If it ever leaks, click Reset Token again to get a new one.

### 3. Start the bot

Unzip the `pixel-bot` folder somewhere easy to find, like your Documents folder. Then open a terminal **in that folder**:

- **Windows:** open the folder in File Explorer, click the address bar, type `cmd`, press Enter.
- **Mac:** open the Terminal app, type `cd ` (with a space after it), drag the `pixel-bot` folder onto the Terminal window, and press Enter.

Run these two commands. The first is only needed once; it downloads discord.js.

```
npm install
npm start
```

The first time, the bot asks for the token. Paste it (in the Windows terminal, right-click pastes) and press Enter. It is saved in a file named `.env` in the folder, so you won't be asked again.

You should see `Pixel Bot is online`.

### 4. Add the bot to your server

When the bot starts, it prints an invite link in the terminal. Copy that link into your browser, pick your server, and click **Authorize**. You need the **Manage Server** permission on that server.

Type `/help` in your server to see everything it can do.

### 5. One last thing: move the bot's role up

Discord only lets a bot moderate people whose top role is *below* the bot's role. Go to **Server Settings → Roles** and drag the **Pixel Bot** role above the roles of the members it should be able to kick, ban or time out.

---

## Keeping it online

The bot is online only while that terminal window is open and your computer is awake. Press **Ctrl + C** in the terminal to stop it, and run `npm start` to start it again.

To keep it online around the clock you'll want to host it somewhere that never sleeps. That's a good next step once you're happy with it.

---

## Commands

### Fun & Games

| Command | What it does |
| --- | --- |
| `/roll` | Roll dice, like `1d20` or `2d6+3` |
| `/coinflip` | Flip a coin |
| `/8ball` | Ask the magic 8-ball a question |
| `/rps` | Rock, paper, scissors against the bot |
| `/trivia` | A multiple-choice question with a 20-second timer |
| `/joke` | Hear a joke |
| `/wouldyourather` | A would-you-rather question everyone can vote on |

### Moderation

These only show up for members who have the matching permission.

| Command | What it does | Permission needed |
| --- | --- | --- |
| `/kick` | Remove a member (they can rejoin) | Kick Members |
| `/ban` | Ban a user, optionally deleting their recent messages | Ban Members |
| `/unban` | Lift a ban, using the user's ID | Ban Members |
| `/timeout` | Mute a member for a while, like `10m` or `2h` | Timeout Members |
| `/untimeout` | End a timeout early | Timeout Members |
| `/warn` | Give a warning that's saved to their record | Timeout Members |
| `/warnings` | See a member's warnings | Timeout Members |
| `/clearwarnings` | Remove one or all of a member's warnings | Timeout Members |
| `/purge` | Delete up to 100 recent messages | Manage Messages |
| `/filter add / remove / list` | Automatically delete messages containing certain words | Manage Server |
| `/automod show / set` | Block invite links, mass mentions and spam | Manage Server |
| `/lockdown` | Stop regular members sending messages in a channel or the whole server (staff can still talk) | Manage Channels |
| `/unlock` | Undo a lockdown, putting permissions back exactly as they were | Manage Channels |
| `/promote` / `/demote` | Move a staff member one rank up or down the ladder | Staff Management or owner |

### Utility

| Command | What it does |
| --- | --- |
| `/help` | List every command |
| `/ping` | Check the bot is responding |
| `/serverinfo` | Details about the server |
| `/userinfo` | Details about a user |
| `/avatar` | Show someone's profile picture full size |
| `/poll` | Start a poll with 2 to 6 choices |
| `/remind` | Get a reminder later, like `in: 2h` `about: check the oven` |
| `/welcome set / off / test` | Greet new members in a channel (needs Manage Server) |
| `/panel post` | Post or update one of your custom panels from the dashboard (needs Manage Server) |
| `/panel list` | List your custom panels (needs Manage Server) |
| `/panel tickets` | Quickly post a basic "Create ticket" button (needs Manage Server) |
| `/panel roles` | Quickly post up to 5 role buttons (needs Manage Server) |
| `/setup show` | Check every setting and see anything that needs fixing (needs Manage Server) |
| `/addemoji` | Add a server emoji from an image (needs Manage Expressions) |
| `/announce` | Post a styled announcement, with an optional @everyone, @here or role ping (needs Manage Server) |
| `/embed create / edit` | Make or edit a styled message through a form, no code needed (needs Manage Server) |
| `/schedule add / list / remove` | Post a message at a set time, once, daily or weekly. Times are Chicago time (needs Manage Server) |

In welcome messages, `{user}` becomes a mention of the new member, `{username}` their name, `{server}` the server name and `{count}` the member count.

### Automatic features

These run on their own once set up:

- **Join role:** every new member gets the Pixel role.
- **Staff role:** anyone with a staff rank automatically gets the Staff role, and loses it when they have none.
- **Staff log:** deleted and edited messages, role changes, timeouts, bans, role/channel/emoji changes, voice channel moves and moderation actions are posted to #staff-logs.
- **Tickets:** the ticket button opens a form, then a private channel only the member and staff can see. Closing it saves a transcript to #ticket-transcripts and deletes the channel.

The roles and channels these use start from `src/config.js`, and can be changed any time in the web dashboard. Names are matched ignoring emoji and symbols, so `SR Moderator` finds `🔱 SR Moderator`. After editing that file, restart the bot and run `/setup show` to check.

---

## Web dashboard

Pixel Bot has a built-in website where anyone with **Manage Server** can change its settings. People log in with Discord; nobody else can change anything. From there you can set up:

- **Panels:** as many as you like. A *role panel* hands out roles from buttons or a dropdown (optionally only one role per member). A *ticket panel* opens private tickets; each button can be a different kind of ticket with its own staff, category, channel name, card colour, first message and questions. Questions have no limit on number or length, and can be short or long text, dropdowns, multiple choice, checkboxes, a yes/no tick box or a file upload, each optional or required with its own hint and placeholder. Discord shows 5 per page, so longer forms get a Continue button. Every panel has its own title, text, colour, images and footer, and saving updates the posted message automatically. There's no limit on panels or options; big panels carry on in extra messages.
- **Custom commands:** your own slash commands like `/rules`, replying with text or a styled card. They can be private, limited to certain roles, or give/remove a role.
- **Welcome and goodbye messages:** card or plain text, title, colour, banner image, footer, ping on/off, and an optional welcome DM.
- **Appearance:** the bot's nickname, status ("Watching the server"), status dot, and the colour of all its cards (server owner only for the last three).
- Staff log channel, auto roles, the rank ladder, ticket defaults, automod, the word filter and scheduled messages.

To switch it on:

1. In the [Developer Portal](https://discord.com/developers/applications), open Pixel Bot → **OAuth2**.
2. Click **Reset Secret** and copy the **Client Secret**.
3. Under **Redirects**, add your dashboard address followed by `/callback`, for example `http://node.wispbyte.com:1234/callback`, and save.
4. Add these two lines to the bot's secret settings file (`.env`), or to the host's environment variables:

   ```
   DASHBOARD_URL=http://node.wispbyte.com:1234
   DISCORD_CLIENT_SECRET=paste-the-client-secret
   ```

5. Restart the bot. It prints `Dashboard is running at ...` when it's on.

## How the project is organised

```
pixel-bot/
├── .env                  your secret token (created on first start)
├── START-PIXEL-BOT.bat   double-click to start the bot on Windows
├── package.json          lists what the bot needs to run
├── data/                 created automatically; the bot's saved memory
└── src/
    ├── index.js          starts the bot
    ├── config.js         your server's roles and channels
    ├── dashboard/        the web dashboard
    ├── commands/
    │   ├── fun/          one file per command
    │   ├── moderation/
    │   └── utility/
    ├── events/           what happens when the bot starts, someone joins, etc.
    └── lib/              shared helpers (saving data, time parsing, colours)
```

Warnings, welcome settings, filtered words and reminders are saved in `data/db.json`. Back that file up if you care about them.

## Adding your own command

Every command is one file. To add `/hello`, create `src/commands/fun/hello.js`:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hello')
    .setDescription('Say hello'),

  async execute(interaction) {
    await interaction.reply(`Hello, ${interaction.user.username}!`);
  },
};
```

Stop the bot with **Ctrl + C**, run `npm start` again, and `/hello` appears in Discord and in `/help` automatically.

Easy things to customise without writing new commands:

- **Trivia questions:** the list at the top of `src/commands/fun/trivia.js`
- **Jokes:** the list at the top of `src/commands/fun/joke.js`
- **8-ball answers:** the list at the top of `src/commands/fun/8ball.js`
- **The bot's colour:** `src/lib/ui.js`

---

## Troubleshooting

**"Discord did not accept the token"**
Reset the token in the Developer Portal and copy the new one. Delete the `.env` file in the `pixel-bot` folder, run `npm start`, and paste the new token when asked. (If you can't see `.env`: on Windows turn on **View → Show → Hidden items**; on Mac press **Cmd + Shift + .** in Finder.)

**"Two switches need to be turned on"**
Turn on both intents from step 2, save, and start the bot again.

**`npm` is not recognized / command not found**
Node.js isn't installed, or the terminal was open while you installed it. Close the terminal, open a new one, and try again.

**Slash commands don't show up**
Make sure you used the invite link the bot printed. Then restart your Discord app (Ctrl + R on desktop), since Discord can take a moment to refresh its command list.

**"I can't kick that member" or "I don't have permission"**
Move the Pixel Bot role higher (step 5), and check that role has the permission for what you're asking.

**The word filter isn't deleting anything**
Members with the Manage Messages permission are exempt on purpose, so test it with a regular account. The bot also needs Manage Messages itself in that channel.
