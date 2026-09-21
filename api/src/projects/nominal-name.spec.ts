import { nominalFromId, nominalId, isNominalId, nominalName } from "./nominal-name";

describe("nominalName", () => {
  it("keeps names without a version suffix", () => {
    expect(nominalName("infrastructure")).toBe("infrastructure");
    expect(nominalName("mon_projet")).toBe("mon_projet");
    expect(nominalName("sans_suffixe")).toBe("sans_suffixe");
    expect(nominalName("vue3")).toBe("vue3");
    expect(nominalName("v2")).toBe("v2");
  });

  it("only strips the suffix when it ends the basename", () => {
    expect(nominalName("projet_v2_bis")).toBe("projet_v2_bis");
    expect(nominalName("data_v2x")).toBe("data_v2x");
  });

  it("strips a trailing _v<digits> suffix", () => {
    expect(nominalName("infrastructure_v2")).toBe("infrastructure");
    expect(nominalName("gateway_v10")).toBe("gateway");
    expect(nominalName("api_v1")).toBe("api");
  });

  it("strips repeated version suffixes iteratively", () => {
    expect(nominalName("infrastructure_v2_v3")).toBe("infrastructure");
  });

  it("keeps a name that is only a version suffix", () => {
    expect(nominalName("_v2")).toBe("_v2");
  });
});

describe("nominalId / isNominalId / nominalFromId", () => {
  it("builds and detects synthetic ids", () => {
    expect(nominalId("infrastructure")).toBe("nominal:infrastructure");
    expect(isNominalId("nominal:infrastructure")).toBe(true);
    expect(isNominalId("p1")).toBe(false);
    expect(nominalFromId("nominal:infrastructure")).toBe("infrastructure");
    expect(nominalFromId("p1")).toBeNull();
  });
});