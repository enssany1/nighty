module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  transform: {
    "^.+\\.tsx?$": ["@swc/jest", {
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022"
      },
      module: { type: "commonjs" }
    }]
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts"]
};
