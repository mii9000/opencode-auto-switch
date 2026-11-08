import { describe, expect, it } from "vitest"
import { isQuestionPrompt } from "./prompt-check"

describe("isQuestionPrompt", () => {
  it("flags a prompt that ends with a question mark", () => {
    expect(isQuestionPrompt("how does auth work?")).toBe(true)
  })

  it("flags a short prompt ending with a question mark", () => {
    expect(isQuestionPrompt("why?")).toBe(true)
  })

  it("flags a lone question mark", () => {
    expect(isQuestionPrompt("?")).toBe(true)
  })

  it("flags a question followed by a trailing space", () => {
    expect(isQuestionPrompt("why does this break? ")).toBe(true)
  })

  it("flags a question followed by a trailing newline", () => {
    expect(isQuestionPrompt("why?\n")).toBe(true)
  })

  it("flags a question followed by a trailing tab and newline", () => {
    expect(isQuestionPrompt("why?\t\n")).toBe(true)
  })

  it("flags a question followed by a trailing CRLF", () => {
    expect(isQuestionPrompt("why?\r\n")).toBe(true)
  })

  it("flags a question followed by a trailing non-breaking space", () => {
    expect(isQuestionPrompt("why?\u00A0")).toBe(true)
  })

  it("does not flag a statement without a question mark", () => {
    expect(isQuestionPrompt("hello")).toBe(false)
  })

  it("does not flag a prompt whose question mark is not final", () => {
    expect(isQuestionPrompt("why? not")).toBe(false)
  })

  it("does not flag a numeric expression without a trailing question mark", () => {
    expect(isQuestionPrompt("what is 1+1")).toBe(false)
  })

  it("does not flag empty text", () => {
    expect(isQuestionPrompt("")).toBe(false)
  })

  it("does not flag whitespace-only text", () => {
    expect(isQuestionPrompt("   ")).toBe(false)
  })
})
