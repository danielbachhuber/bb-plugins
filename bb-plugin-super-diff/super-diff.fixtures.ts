// An invented Super Diff for the stories: a storefront renames a hook across
// 57 files. Every name, path, line, and count here is made up.
import type { PlacedNote } from "./annotations";
import type { StoredSuperDiff } from "./grouping";

const MINUTE = 60_000;

const components = [
  "add-to-cart-button", "bundle-offer", "cart-drawer", "cart-line", "checkout-summary", "compare-table",
  "coupon-field", "delivery-estimate", "gift-card-balance", "installments-note", "invoice-row", "loyalty-badge",
  "mini-cart", "order-history-row", "order-total", "price-filter", "price-range", "price-tag", "product-card",
  "product-header", "quick-view", "recently-viewed", "refund-row", "sale-badge", "saved-for-later",
  "shipping-picker", "size-chart-price", "store-switcher", "subscription-plan", "tax-line", "tip-selector",
  "upsell-row", "wishlist-row",
].map((name) => `src/components/${name}.tsx`);

const dataHooks = ["cart", "catalog", "use-catalog-query", "orders", "wishlist", "promotions", "shipping-rates", "tax-quote"].map(
  (name) => `src/data/${name}.ts`,
);

export const FIXTURE: StoredSuperDiff = {
  target: { type: "all", mergeBaseBranch: "origin/main" },
  acceptedAt: new Date(Date.now() - 2 * MINUTE).toISOString(),
  paths: [],
  submission: {
    concerns: [
      {
        title: "Drop the host-reading hook and call the lookup directly",
        explanation:
          "The old `useStoreCurrency` in request-context only returned `currencyFromHost()`. It is deleted, and the three places that used it, all of which render before a `PricingProvider` exists, call the function themselves. Check that none of them could have used the context hook instead.",
        files: [
          "src/system/request-context.ts",
          "src/shell/storefront.tsx",
          "src/data/catalog-config.ts",
          "src/app/[storeKey]/(shop)/_layout.tsx",
        ],
        summaries: {
          "src/system/request-context.ts": "Deletes the useStoreCurrency wrapper and its header mention",
          "src/shell/storefront.tsx": "PricingProvider gets its currency from currencyFromHost",
          "src/data/catalog-config.ts": "The catalog query's currency comes from currencyFromHost",
          "src/app/[storeKey]/(shop)/_layout.tsx": "Checkout and region checks read the host lookup directly",
        },
      },
      {
        title: "Rename the hook that reads the shop's currency",
        explanation: "`useCurrency` in money.tsx takes the freed name, because the currency comes from the store. Its body is unchanged.",
        files: ["src/format/money.tsx"],
        summaries: { "src/format/money.tsx": "Renames the export and its use in useFormatPrice; body unchanged" },
      },
      {
        title: "Data hooks that send the currency to the API",
        explanation: "Each hook passes the currency to a catalog or cart request. They follow the rename and send the same value.",
        files: dataHooks,
        summaries: {},
        others: "Only the import and the call are renamed; the currency they send is the same",
      },
      {
        title: "Screens and components that show prices",
        explanation:
          "Every component that formats a price follows the rename in its import and call, and nothing else. This is most of the diff and can be skimmed.",
        files: components,
        summaries: {},
        others: "Only the import and the call are renamed",
      },
      {
        title: "Tests and demos follow the rename",
        explanation: "The hook's tests move to a file named for `currencyFromHost` and call it directly. The demos only rename the hook.",
        files: [
          "src/system/use-store-currency.test.tsx",
          "src/system/currency-from-host.test.tsx",
          "src/format/pricing-provider-currency.test.tsx",
          "src/components/__demos__/price-tag.demo.tsx",
          "src/components/__demos__/cart-line.demo.tsx",
        ],
        summaries: {
          "src/system/use-store-currency.test.tsx": "Deleted along with the hook it tested",
          "src/system/currency-from-host.test.tsx": "Same eight cases, calling currencyFromHost without renderHook",
          "src/format/pricing-provider-currency.test.tsx": "Renames the hook and one test title",
        },
        others: "Only the import and the call are renamed",
      },
      {
        title: "Docs and comments name the right function",
        explanation:
          "Comments and docs now name `useStoreCurrency` for the React hook and `currencyFromHost` for the host lookup. Two comment blocks are rewrapped because the longer name pushed a line past 80 columns.",
        files: [
          "docs/pricing.md",
          "src/format/README.md",
          "src/format/pricingContext.tsx",
          "src/app/store-params.ts",
          "src/system/host-currency-map.ts",
          "scripts/build-currency-map.ts",
        ],
        summaries: {
          "docs/pricing.md": "Says the price cache key comes from useStoreCurrency",
          "src/format/README.md": "Lists useStoreCurrency for money.tsx",
          "src/format/pricingContext.tsx": "Header names useStoreCurrency; lines rewrapped",
          "src/app/store-params.ts": "Header names useStoreCurrency; lines rewrapped",
          "src/system/host-currency-map.ts": "Precedence note points to currencyFromHost",
          "scripts/build-currency-map.ts": "Map doc points to currencyFromHost",
        },
      },
    ],
    annotations: [
      {
        path: "src/app/[storeKey]/(shop)/_layout.tsx",
        anchor: "",
        title: "Its currency has to match the PricingProvider's",
        body: "The layout renders above `PricingProvider`, so the renamed hook would return the `'USD'` default here. It reads `currencyFromHost()` instead, which is where the provider gets its value too.",
      },
      {
        path: "src/data/use-catalog-query.ts",
        anchor: "",
        title: "Feeds the cache key, so the value must not change",
        body: "The currency is part of every catalog query's cache key. The rename keeps the same value, so cached pages stay valid; a different source here would refetch the whole catalog.",
      },
      {
        path: "src/format/pricing-provider-currency.test.tsx",
        anchor: "",
        title: "Still pins the PricingProvider as the hook's source",
        body: "This test mounts a `PricingProvider` and checks the hook returns its currency. It passes unchanged, which is the evidence that the rename did not change where the value comes from.",
      },
      {
        path: "src/format/pricingContext.tsx",
        anchor: "",
        title: "Rewrap leaves one short line",
        body: "Only the comment changed. The longer name moved one word to a new line, which is why the block looks edited.",
      },
    ],
  },
};

FIXTURE.paths = FIXTURE.submission.concerns.flatMap((concern) => concern.files);

const LINES: Record<string, number> = {
  "src/app/[storeKey]/(shop)/_layout.tsx": 19,
  "src/data/use-catalog-query.ts": 52,
  "src/format/pricing-provider-currency.test.tsx": 148,
  "src/format/pricingContext.tsx": 7,
};

/** The notes numbered as the Super Diff numbers them: by concern, then file, then line. */
export const FIXTURE_NOTES: PlacedNote[] = FIXTURE.submission.annotations.map((note, index) => ({
  ...note,
  id: `note-${index}`,
  n: index + 1,
  line: LINES[note.path] ?? null,
  side: "new",
}));

/** Diff Viewed's marks: 32 of 57, none yet in the first two concerns. */
export const FIXTURE_VIEWED: ReadonlySet<string> = new Set([
  ...dataHooks.slice(0, 6),
  ...components.slice(0, 19),
  "src/components/__demos__/price-tag.demo.tsx",
  ...FIXTURE.submission.concerns[5]!.files,
]);

/** The diff of the first concern's last file, with note 1 on its added line 19. */
export const LAYOUT_PATH = "src/app/[storeKey]/(shop)/_layout.tsx";
export const LAYOUT_PATCH = [
  `diff --git a/${LAYOUT_PATH} b/${LAYOUT_PATH}`,
  "index 3a4b5c6..7d8e9f0 100644",
  `--- a/${LAYOUT_PATH}`,
  `+++ b/${LAYOUT_PATH}`,
  "@@ -1,5 +1,5 @@",
  " import { Slot } from 'acme-router';",
  "-import { useStoreCurrency } from 'system/request-context';",
  "+import { currencyFromHost } from 'system/request-context';",
  " import { useRegion } from 'data/region';",
  " import { CheckoutGate } from 'shell/checkout-gate';",
  " ",
  "@@ -15,9 +15,9 @@",
  " export default function ShopLayout() {",
  "     const store = useStoreParams();",
  "     const region = useRegion(store);",
  "     // Checkout needs the currency before PricingProvider mounts.",
  "-    const currency = useStoreCurrency();",
  "+    const currency = currencyFromHost();",
  "     if (!region.sellsIn(currency)) {",
  "         return <CheckoutGate reason=\"currency\" />;",
  "     }",
  "     return <Slot />;",
  "",
].join("\n");
