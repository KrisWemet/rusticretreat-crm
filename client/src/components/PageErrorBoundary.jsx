import { Component } from 'react'

export default class PageErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="max-w-lg mx-auto p-6 space-y-4" role="alert">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="text-slate-600">Check your connection, then reload to try again. You may need to re-enter changes that had not been saved.</p>
      <button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
    </main>
  }
}
