// Server setup for The Pixel Bassment.
//
// These defaults only apply to the home server below. Any other server Pixel Bot
// joins starts clean (no automatic roles, no staff ladder) and is set up in the
// dashboard instead.
//
// Roles and channels are matched by name, ignoring emoji, symbols, spaces and
// capitals, so "🔱 SR Moderator" can be written here as "SR Moderator".
// You can also use an ID (the long number) instead of a name.
// After changing this file, restart the bot. Check the result with /setup show.
module.exports = {
  // The Pixel Bassment's server ID.
  homeServer: '1557979850625515570',

  // Your own web addresses for the dashboard (on top of DASHBOARD_URL / DASHBOARD_ALIASES).
  // Each one also needs "<address>/callback" added under OAuth2 → Redirects in the Developer Portal.
  siteAddresses: ['https://pixelbotstudio.net', 'https://www.pixelbotstudio.net'],

  // Roles every new member gets when they join.
  autoroles: ['Pixel'],

  // Anyone with at least one of these roles automatically gets the staff role,
  // and loses it when they no longer have any of them.
  staffRole: 'Staff',
  staffSourceRoles: [
    'Trial Moderator',
    'Moderator',
    'SR Moderator',
    'Administrator',
    'Staff Management',
    'Head of Staff',
    'Developer',
  ],

  // The staff ladder for /promote and /demote, lowest rank first.
  ranks: [
    '1558218255179452536', // Trial Moderator
    '1558215166313894009', // Moderator
    '1558215626919780372', // SR Moderator
    '1558217075523063901', // Administrator
    '1558213842415386776', // Staff Management
  ],
  // Who can use /promote and /demote (the server owner and Administrators always can).
  // Only the server owner can promote someone into the top rank or demote them out of it.
  rankManagers: ['Staff Management'],

  // Times for /schedule are read in this time zone.
  timezone: 'America/Chicago',

  // Where the staff log goes.
  logChannel: 'staff-logs',

  // Welcome message defaults (change them any time with /welcome set).
  welcome: {
    channel: 'welcome',
    message: 'Welcome to The Pixel Basement {user}',
  },

  tickets: {
    category: 'Tickets', // where new ticket channels are created
    transcriptChannel: 'ticket-transcripts', // where transcripts are posted when a ticket closes
    staffRoles: ['Head of Staff', 'Staff Management', 'SR Moderator', 'Developer', 'Administrator', 'Moderator'],
    question: 'What is your purpose for making this ticket?',
    panelTitle: 'Tickets',
    panelText:
      'Use the button below to open a ticket, tickets are used for applications too so in the ticket mention if you applying for something and what that something is',
    maxOpenPerUser: 1,
  },
};
