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
        <div className="app-header__right">
          <span className="app-header__copyright">© 2026 Tyler Mckinney - <a href="https://effxs.com" target="_blank" rel="noopener noreferrer" style={{ color: '#58a6ff', textDecoration: 'none' }}>effxs.com</a></span>
          <a
            href="https://github.com/tylermckinney11/ollama-lyzer"
            target="_blank"
            rel="noopener noreferrer"
            className="app-header__link"
          >
            GitHub
          </a>
        </div>
      </header>
      <main className="app-main">
        <OllamaMonitor />
      </main>
    </div>
  )
}
