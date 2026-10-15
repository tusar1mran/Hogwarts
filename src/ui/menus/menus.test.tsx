import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// Session actions touch pointer lock, audio and the 3D runtime; stub them for UI tests.
const session = vi.hoisted(() => ({
  startNewGame: vi.fn(),
  continueGame: vi.fn(() => true),
  resumeGame: vi.fn(),
  returnToMenu: vi.fn(),
  lockOrPrompt: vi.fn(),
}))
vi.mock('../../game/session', () => session)

import { MainMenu } from './MainMenu'
import { GameOverlays } from './GameMenus'
import { useGame } from '../../game/state/gameStore'
import { useSettings, DEFAULT_SETTINGS } from '../../game/state/settings'
import { useProgression } from '../../game/state/progressionStore'
import { SAVE_KEY, serializeSave } from '../../game/quests/saveSystem'
import { createProgression } from '../../game/quests/questEngine'

beforeEach(() => {
  localStorage.clear()
  Object.values(session).forEach((f) => f.mockClear())
  useGame.setState({ phase: 'menu', overlay: null, menuScreen: 'main', settingsTab: 'graphics' })
  useSettings.setState({ ...DEFAULT_SETTINGS })
  useProgression.setState({ progression: createProgression() })
})
afterEach(cleanup)

describe('main menu', () => {
  it('starts a new game', () => {
    render(<MainMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Start New Game' }))
    expect(session.startNewGame).toHaveBeenCalledOnce()
  })

  it('disables Continue without a valid save', () => {
    render(<MainMenu />)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('enables Continue when a valid save exists', () => {
    localStorage.setItem(SAVE_KEY, serializeSave(createProgression()))
    render(<MainMenu />)
    const btn = screen.getByRole('button', { name: 'Continue' })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(session.continueGame).toHaveBeenCalledOnce()
  })

  it('keeps Continue disabled for a corrupt save', () => {
    localStorage.setItem(SAVE_KEY, '{broken')
    render(<MainMenu />)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('opens settings and credits and returns', () => {
    render(<MainMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }))
    expect(screen.getByRole('dialog', { name: 'Credits' })).toBeInTheDocument()
  })
})

describe('settings panel', () => {
  it('changes affect the settings store', () => {
    useGame.setState({ menuScreen: 'settings', settingsTab: 'audio' })
    render(<MainMenu />)
    fireEvent.click(screen.getByLabelText('Mute all'))
    expect(useSettings.getState().audio.muted).toBe(true)
    fireEvent.change(screen.getByLabelText(/Master volume/), { target: { value: '0.25' } })
    expect(useSettings.getState().audio.master).toBe(0.25)
  })

  it('applies quality presets', () => {
    useGame.setState({ menuScreen: 'settings', settingsTab: 'graphics' })
    render(<MainMenu />)
    fireEvent.change(screen.getByLabelText(/Quality preset/), { target: { value: 'low' } })
    expect(useSettings.getState().graphics.quality).toBe('low')
    expect(useSettings.getState().graphics.shadows).toBe(false)
  })

  it('rebinds a key', () => {
    useGame.setState({ menuScreen: 'settings', settingsTab: 'controls' })
    render(<MainMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Rebind Jump slot 1' }))
    fireEvent.keyDown(window, { code: 'KeyK' })
    expect(useSettings.getState().controls.bindings.jump[0]).toBe('KeyK')
  })
})

describe('pause menu and in-game overlays', () => {
  beforeEach(() => useGame.setState({ phase: 'playing', overlay: 'pause' }))

  it('resumes', () => {
    render(<GameOverlays />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(session.resumeGame).toHaveBeenCalledOnce()
  })

  it('navigates to the spellbook, journal and artefacts', () => {
    const { rerender } = render(<GameOverlays />)
    fireEvent.click(screen.getByRole('button', { name: 'Spellbook' }))
    expect(useGame.getState().overlay).toBe('spellbook')
    rerender(<GameOverlays />)
    expect(screen.getByRole('dialog', { name: 'Spellbook' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quest Journal' }))
    expect(useGame.getState().overlay).toBe('journal')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Artefacts' }))
    expect(useGame.getState().overlay).toBe('inventory')
  })

  it('asks for confirmation before returning to the main menu', () => {
    render(<GameOverlays />)
    fireEvent.click(screen.getByRole('button', { name: 'Return to Main Menu' }))
    expect(session.returnToMenu).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(session.returnToMenu).toHaveBeenCalledOnce()
  })

  it('pause() only opens the pause menu during active play', () => {
    useGame.setState({ overlay: null })
    useGame.getState().pause()
    expect(useGame.getState().overlay).toBe('pause')
    useGame.setState({ phase: 'menu', overlay: null })
    useGame.getState().pause()
    expect(useGame.getState().overlay).toBeNull()
  })
})
