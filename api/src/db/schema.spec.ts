import { getTableColumns } from "drizzle-orm/utils";
import { projects } from "./schema";

describe("db schema", () => {
  it("defines the projects table", () => {
    expect(Object.keys(getTableColumns(projects)).length).toBeGreaterThan(0);
  });
});
