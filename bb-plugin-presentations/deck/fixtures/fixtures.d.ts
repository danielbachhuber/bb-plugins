// Vite resolves these imports to the asset's URL.
declare module "*.svg?no-inline" {
  const url: string;
  export default url;
}
