import './ModeSelect.css'

export function ModeSelect() {
  return (
    <section className="mode-select">
      <h2>Select a device mode</h2>
      <p>
        Choose how this browser should behave. Table mode shows the shared game
        state, player mode is for individual hands.
      </p>
      <div className="mode-select__actions">
        <a className="mode-select__button" href="/?mode=table">
          Table view
        </a>
        <a className="mode-select__button mode-select__button--primary" href="/?mode=player">
          Player view
        </a>
      </div>
    </section>
  )
}