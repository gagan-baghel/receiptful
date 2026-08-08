/**
 * Seed data every new workspace starts with. These are real, editable rows —
 * the workspace owner can rename, recolor, or delete any of them.
 */

export type DefaultCategory = {
  name: string;
  color: string;
  icon: string;
  taxTreatment: "deductible" | "partial" | "non_deductible";
  deductiblePercent: number;
  keywords: string[];
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    name: "Food & Dining",
    color: "#f59e0b",
    icon: "UtensilsCrossed",
    taxTreatment: "partial",
    deductiblePercent: 50,
    keywords: [
      "restaurant", "cafe", "coffee", "starbucks", "mcdonald", "subway", "pizza",
      "burger", "diner", "bistro", "bakery", "deli", "grill", "kitchen", "sushi",
      "taco", "doordash", "ubereats", "grubhub", "swiggy", "zomato", "dunkin",
      "chipotle", "kfc", "domino", "panera", "tea", "juice", "bar", "pub",
    ],
  },
  {
    name: "Groceries",
    color: "#10b981",
    icon: "ShoppingCart",
    taxTreatment: "non_deductible",
    deductiblePercent: 0,
    keywords: [
      "grocery", "supermarket", "walmart", "kroger", "safeway", "aldi", "lidl",
      "trader joe", "whole foods", "tesco", "sainsbury", "costco", "market",
      "food mart", "big bazaar", "reliance fresh", "dmart", "publix", "wegmans",
    ],
  },
  {
    name: "Fuel & Transport",
    color: "#3b82f6",
    icon: "Fuel",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "shell", "bp", "exxon", "chevron", "petrol", "gas station", "fuel",
      "uber", "lyft", "ola", "taxi", "cab", "metro", "transit", "parking",
      "toll", "texaco", "mobil", "indian oil", "hp petrol", "bharat petroleum",
    ],
  },
  {
    name: "Medical & Health",
    color: "#ef4444",
    icon: "HeartPulse",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "pharmacy", "clinic", "hospital", "doctor", "dental", "medical", "health",
      "cvs", "walgreens", "apollo", "boots", "optician", "lab", "diagnostic",
      "physio", "chemist", "medicine",
    ],
  },
  {
    name: "Office & Supplies",
    color: "#8b5cf6",
    icon: "Briefcase",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "staples", "office depot", "stationery", "printer", "ink", "paper",
      "ikea", "furniture", "desk", "chair", "coworking", "wework", "supplies",
    ],
  },
  {
    name: "Travel",
    color: "#06b6d4",
    icon: "Plane",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "airline", "airways", "flight", "delta", "united", "emirates", "lufthansa",
      "indigo", "ryanair", "easyjet", "expedia", "booking.com", "airport",
      "amtrak", "railway", "train", "rental car", "hertz", "avis", "baggage",
    ],
  },
  {
    name: "Hotel & Lodging",
    color: "#0ea5e9",
    icon: "BedDouble",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "hotel", "motel", "inn", "resort", "marriott", "hilton", "hyatt", "airbnb",
      "lodging", "suites", "hostel", "oyo", "radisson", "novotel", "ibis",
    ],
  },
  {
    name: "Entertainment",
    color: "#ec4899",
    icon: "Clapperboard",
    taxTreatment: "non_deductible",
    deductiblePercent: 0,
    keywords: [
      "cinema", "movie", "theater", "netflix", "spotify", "concert", "ticket",
      "game", "steam", "playstation", "xbox", "amusement", "museum", "bowling",
    ],
  },
  {
    name: "Education",
    color: "#6366f1",
    icon: "GraduationCap",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "course", "udemy", "coursera", "training", "school", "university", "book",
      "tuition", "workshop", "seminar", "certification", "textbook", "class",
    ],
  },
  {
    name: "Utilities",
    color: "#84cc16",
    icon: "Zap",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "electric", "electricity", "water", "gas bill", "internet", "broadband",
      "comcast", "verizon", "at&t", "vodafone", "airtel", "jio", "utility",
      "telecom", "mobile bill", "phone bill", "wifi",
    ],
  },
  {
    name: "Shopping",
    color: "#f97316",
    icon: "ShoppingBag",
    taxTreatment: "non_deductible",
    deductiblePercent: 0,
    keywords: [
      "amazon", "ebay", "target", "best buy", "apple store", "nike", "adidas",
      "zara", "h&m", "clothing", "shoes", "electronics", "flipkart", "myntra",
      "mall", "retail",
    ],
  },
  {
    name: "Subscriptions",
    color: "#a855f7",
    icon: "RefreshCw",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "subscription", "monthly plan", "annual plan", "adobe", "figma", "notion",
      "slack", "google workspace", "microsoft 365", "dropbox", "github",
      "openai", "anthropic", "aws", "vercel", "saas", "license", "renewal",
    ],
  },
  {
    name: "Professional Services",
    color: "#14b8a6",
    icon: "Scale",
    taxTreatment: "deductible",
    deductiblePercent: 100,
    keywords: [
      "consultant", "legal", "lawyer", "accountant", "audit", "advisory",
      "agency", "freelancer", "contractor", "notary", "bookkeeping",
    ],
  },
  {
    name: "Personal",
    color: "#64748b",
    icon: "Wallet",
    taxTreatment: "non_deductible",
    deductiblePercent: 0,
    keywords: ["personal", "gift", "donation", "salon", "spa", "gym", "fitness"],
  },
];

export const DEFAULT_FOLDERS = [
  { name: "Business", color: "#2563eb", icon: "Briefcase" },
  { name: "Personal", color: "#64748b", icon: "User" },
  { name: "Tax Documents", color: "#16a34a", icon: "FileCheck" },
];

export const DEFAULT_TAGS = [
  { name: "Tax", color: "#16a34a" },
  { name: "Reimbursement", color: "#2563eb" },
  { name: "Warranty", color: "#a855f7" },
  { name: "Client", color: "#f59e0b" },
  { name: "Important", color: "#ef4444" },
];

/** Bytes of receipt storage included per plan. */
export const PLAN_STORAGE_BYTES = {
  free: 1024 * 1024 * 1024, // 1 GB
  pro: 25 * 1024 * 1024 * 1024, // 25 GB
  business: 250 * 1024 * 1024 * 1024, // 250 GB
} as const;

export const PLAN_SEATS = { free: 1, pro: 5, business: 50 } as const;
