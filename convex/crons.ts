import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "budget threshold alerts",
  { hourUTC: 7, minuteUTC: 0 },
  internal.budgets.checkThresholds,
);

crons.daily(
  "purge expired trash",
  { hourUTC: 3, minuteUTC: 0 },
  internal.maintenance.purgeExpiredTrash,
);

crons.daily(
  "expire stale invites",
  { hourUTC: 3, minuteUTC: 30 },
  internal.maintenance.expireInvites,
);

crons.daily(
  "auto-archive old receipts",
  { hourUTC: 4, minuteUTC: 0 },
  internal.maintenance.autoArchive,
);

crons.daily(
  "complete account deletions",
  { hourUTC: 4, minuteUTC: 30 },
  internal.maintenance.purgeDeletedAccounts,
);

crons.daily(
  "refresh exchange rates",
  { hourUTC: 5, minuteUTC: 0 },
  internal.maintenance.refreshExchangeRates,
);

crons.monthly(
  "quarterly tax reminders",
  { day: 5, hourUTC: 9, minuteUTC: 0 },
  internal.maintenance.taxReminders,
);

export default crons;
