import { describe, expect, it } from "vitest";
import { getTranslations, resolveLanguage, translationKeys } from "../src/core/i18n";

describe("i18n", () => {
  it("resolves Chinese and Russian locales and falls back to English", () => {
    expect(resolveLanguage("zh_CN.UTF-8")).toBe("zh-CN");
    expect(resolveLanguage("ru-RU")).toBe("ru");
    expect(resolveLanguage("de-DE")).toBe("en");
  });

  it("keeps every catalog complete", () => {
    for (const language of ["en", "zh-CN", "ru"] as const) {
      expect(Object.keys(getTranslations(language)).sort()).toEqual([...translationKeys].sort());
      expect(Object.values(getTranslations(language)).every(Boolean)).toBe(true);
    }
  });
});
