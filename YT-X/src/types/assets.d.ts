// Webpack inlines images as data URIs (`asset/inline`).
declare module '*.png' {
  const dataUri: string;
  export default dataUri;
}

// Stylesheets are imported for side effects only; css-loader injects them.
declare module '*.css';
