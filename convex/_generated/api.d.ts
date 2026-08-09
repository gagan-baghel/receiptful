/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as approvals from "../approvals.js";
import type * as auth from "../auth.js";
import type * as budgets from "../budgets.js";
import type * as categories from "../categories.js";
import type * as crons from "../crons.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as maintenance from "../maintenance.js";
import type * as model_bootstrap from "../model/bootstrap.js";
import type * as model_defaults from "../model/defaults.js";
import type * as model_email from "../model/email.js";
import type * as model_guards from "../model/guards.js";
import type * as model_lib from "../model/lib.js";
import type * as model_receipts from "../model/receipts.js";
import type * as notifications from "../notifications.js";
import type * as ocr from "../ocr.js";
import type * as ocrStore from "../ocrStore.js";
import type * as rateLimits from "../rateLimits.js";
import type * as receipts from "../receipts.js";
import type * as reports from "../reports.js";
import type * as savedFilters from "../savedFilters.js";
import type * as seedDemo from "../seedDemo.js";
import type * as tags from "../tags.js";
import type * as team from "../team.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  approvals: typeof approvals;
  auth: typeof auth;
  budgets: typeof budgets;
  categories: typeof categories;
  crons: typeof crons;
  folders: typeof folders;
  http: typeof http;
  maintenance: typeof maintenance;
  "model/bootstrap": typeof model_bootstrap;
  "model/defaults": typeof model_defaults;
  "model/email": typeof model_email;
  "model/guards": typeof model_guards;
  "model/lib": typeof model_lib;
  "model/receipts": typeof model_receipts;
  notifications: typeof notifications;
  ocr: typeof ocr;
  ocrStore: typeof ocrStore;
  rateLimits: typeof rateLimits;
  receipts: typeof receipts;
  reports: typeof reports;
  savedFilters: typeof savedFilters;
  seedDemo: typeof seedDemo;
  tags: typeof tags;
  team: typeof team;
  uploads: typeof uploads;
  users: typeof users;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
