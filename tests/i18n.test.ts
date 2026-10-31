import assert from "node:assert/strict";
import test from "node:test";
import { countryDisplayName, createTranslator, formatHistoryDate, formatMonth } from "../src/lib/i18n";

test("navigation and country names switch language while stable identifiers remain unchanged", () => {
  assert.equal(createTranslator("zh-CN")("国家历史变迁"), "国家历史变迁");
  assert.equal(createTranslator("en")("国家历史变迁"), "A nation through time");
  assert.equal(createTranslator("en")("选择历史月份"), "Choose a historical month");
  assert.equal(countryDisplayName("CN", "zh-CN"), "中国");
  assert.equal(countryDisplayName("CN", "en"), "China");
  assert.equal(countryDisplayName("XX", "en"), "XX");
});

test("historical dates are formatted in the selected locale without timezone day shifts", () => {
  assert.equal(formatMonth("1800-01", "en"), "January 1800");
  assert.equal(formatMonth("1800-01", "zh-CN"), "1800年1月");
  assert.equal(formatHistoryDate("2000-02-29", "en"), "February 29, 2000");
  assert.equal(formatHistoryDate("2000-02-29", "zh-CN"), "2000年2月29日");
  assert.equal(formatMonth("invalid", "en"), "invalid");
});
