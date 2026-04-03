import OllamaMonitor from './OllamaMonitor'

export default function App() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__left">
          <span className="app-header__logo">🦙</span>
          <span className="app-header__title">Ollama Lyzer</span>
          <span className="app-header__sub">benchmark &amp; monitor</span>
        </div>
        <a
          href="https://github.com/noob/ollama-lyzer"
          target="_blank"
          rel="noopener noreferrer"
          className="app-header__link"
        >
          GitHub
        </a>
      </header>
      <main className="app-main">
        <OllamaMonitor />
      </main>
    </div>
  )
}
