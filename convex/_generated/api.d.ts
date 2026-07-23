/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as branches from "../branches.js";
import type * as categories from "../categories.js";
import type * as customers from "../customers.js";
import type * as deliveries from "../deliveries.js";
import type * as employees from "../employees.js";
import type * as expenses from "../expenses.js";
import type * as http from "../http.js";
import type * as invoices from "../invoices.js";
import type * as leads from "../leads.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as orders from "../orders.js";
import type * as products from "../products.js";
import type * as purchaseReturns from "../purchaseReturns.js";
import type * as repairs from "../repairs.js";
import type * as router from "../router.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as shipments from "../shipments.js";
import type * as suppliers from "../suppliers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  branches: typeof branches;
  categories: typeof categories;
  customers: typeof customers;
  deliveries: typeof deliveries;
  employees: typeof employees;
  expenses: typeof expenses;
  http: typeof http;
  invoices: typeof invoices;
  leads: typeof leads;
  "lib/auth": typeof lib_auth;
  "lib/permissions": typeof lib_permissions;
  orders: typeof orders;
  products: typeof products;
  purchaseReturns: typeof purchaseReturns;
  repairs: typeof repairs;
  router: typeof router;
  seed: typeof seed;
  settings: typeof settings;
  shipments: typeof shipments;
  suppliers: typeof suppliers;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
