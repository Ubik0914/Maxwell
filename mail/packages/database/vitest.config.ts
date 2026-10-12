import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "database",
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 同じテストDBを使うため直列に実行する
    fileParallelism: false,
  },
});
