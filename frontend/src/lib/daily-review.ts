/** Professional daily review checklist templates. */

export type ChecklistItem = {
  id: string;
  label: string;
  hint?: string;
};

export type ChecklistSection = {
  id: string;
  title: string;
  subtitle: string;
  items: ChecklistItem[];
};

export const DAILY_REVIEW_SECTIONS: ChecklistSection[] = [
  {
    id: "preopen",
    title: "Pre-open",
    subtitle: "Before the bell — prepare, don’t predict",
    items: [
      {
        id: "po-calendar",
        label: "Checked red-folder calendar for today",
        hint: "News tab · cut size or stand down into CPI/FOMC/NFP",
      },
      {
        id: "po-bias",
        label: "Wrote one-line daily bias (trend / range / no-trade)",
        hint: "If you can’t write it in one line, you are not ready",
      },
      {
        id: "po-levels",
        label: "Marked key levels (PDH/PDL, ONH/ONL, VWAP zone)",
      },
      {
        id: "po-watchlist",
        label: "Watchlist ≤ 5 symbols (quality over quantity)",
      },
      {
        id: "po-playbook",
        label: "Chose which playbook(s) are allowed today",
        hint: "Strategies tab · only A+ setups from those books",
      },
      {
        id: "po-risk",
        label: "Set max loss ($) and max trades for the day",
      },
      {
        id: "po-platform",
        label: "Platforms ready (Schwab) + data ok",
      },
    ],
  },
  {
    id: "session",
    title: "During session",
    subtitle: "Process over P&L while the market is open",
    items: [
      {
        id: "ss-wait",
        label: "Waited for my window (no early FOMO)",
      },
      {
        id: "ss-checklist",
        label: "Every entry matched playbook entry steps",
        hint: "If a step is missing, it is not a trade",
      },
      {
        id: "ss-size",
        label: "Size from risk plan — not from conviction feeling",
      },
      {
        id: "ss-stop",
        label: "Stop placed immediately; never moved farther away",
      },
      {
        id: "ss-revenge",
        label: "No revenge trade after a loss",
      },
      {
        id: "ss-daily-stop",
        label: "Stopped trading if daily max loss hit",
      },
    ],
  },
  {
    id: "post",
    title: "Post-session",
    subtitle: "Close the loop so tomorrow is cleaner",
    items: [
      {
        id: "ps-journal",
        label: "Journaled each trade: thesis, rules followed, outcome",
      },
      {
        id: "ps-broke",
        label: "Named any rule I broke (honest one-liner)",
      },
      {
        id: "ps-best",
        label: "Noted best decision of the day (even if loser)",
      },
      {
        id: "ps-carry",
        label: "Carried levels / bias note into tomorrow’s pre-open",
      },
      {
        id: "ps-reset",
        label: "Closed charts emotionally — day is done",
      },
    ],
  },
];
