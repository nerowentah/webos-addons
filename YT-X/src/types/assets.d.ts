// Webpack inlines images as data URIs (`asset/inline`).
declare module '*.png' {
  const dataUri: string;
  export default dataUri;
}
