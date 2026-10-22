export default {
  extends: ['stylelint-config-recommended'],
  rules: {
    // A heuristic; satisfying it means reordering a hand-tuned cascade that
    // can only be verified on a TV.
    'no-descending-specificity': null,
    // YouTube's own markup is matched by obfuscated classes and custom
    // elements (ytlr-*); unknown-type selectors are the point here.
    'selector-type-no-unknown': [true, { ignore: ['custom-elements'] }]
  }
};
