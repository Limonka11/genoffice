// @vitest-environment jsdom
// The editor's own toasts in review mode: the host shows the save status in its bar, so the English
// "Saved" toast (the app's ToastHost, .app-toast.success) stays hidden; error toasts still show.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const hostCss = readFileSync(resolve(__dirname, '../host.css'), 'utf8')

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.classList.remove('vound-review')
})

function toast(kind: 'success' | 'error') {
  const style = document.createElement('style')
  style.textContent = hostCss
  document.head.append(style)
  const element = document.createElement('div')
  element.className = `app-toast ${kind} show`
  document.body.append(element)
  return element
}

describe('editor toasts in review mode', () => {
  it('hides the success toast in review mode and nowhere else', () => {
    const saved = toast('success')
    expect(getComputedStyle(saved).display).not.toBe('none')
    document.documentElement.classList.add('vound-review')
    expect(getComputedStyle(saved).display).toBe('none')
  })

  it('keeps error toasts', () => {
    document.documentElement.classList.add('vound-review')
    expect(getComputedStyle(toast('error')).display).not.toBe('none')
  })
})
