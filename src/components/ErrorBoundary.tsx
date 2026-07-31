import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onReset: () => void
}

interface State {
  hasError: boolean
}

/** 描画エラーを白画面にせず、安全な復旧操作へ切り替える。 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('画面の描画中にエラーが発生しました', error, info)
  }

  private reset = () => {
    this.setState({ hasError: false })
    this.props.onReset()
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page error-boundary" role="alert" aria-live="assertive">
          <section className="card">
            <h1>画面の表示中にエラーが発生しました</h1>
            <p>
              入力中の内容は下書きに残しています。ホームへ戻り、もう一度記録を開いてください。
            </p>
            <button className="primary-btn" type="button" onClick={this.reset}>
              入力内容を残してホームへ戻る
            </button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
