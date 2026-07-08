import { useState } from 'react'
import type { RecordDoc, RecordType } from './lib/types'
import Home from './pages/Home'
import InputForm from './pages/InputForm'
import Result from './pages/Result'
import History from './pages/History'
import Settings from './pages/Settings'

export type View =
  | { name: 'home' }
  | { name: 'form'; type: RecordType }
  | { name: 'result'; record: RecordDoc }
  | { name: 'history' }
  | { name: 'settings' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })

  return (
    <div className="app">
      {view.name === 'home' && <Home go={setView} />}
      {view.name === 'form' && (
        <InputForm
          type={view.type}
          onBack={() => setView({ name: 'home' })}
          onGenerated={(record) => setView({ name: 'result', record })}
          goSettings={() => setView({ name: 'settings' })}
        />
      )}
      {view.name === 'result' && (
        <Result
          record={view.record}
          onBack={() => setView({ name: 'home' })}
          onSaved={() => setView({ name: 'history' })}
        />
      )}
      {view.name === 'history' && (
        <History
          onBack={() => setView({ name: 'home' })}
          onOpen={(record) => setView({ name: 'result', record })}
        />
      )}
      {view.name === 'settings' && <Settings onBack={() => setView({ name: 'home' })} />}
    </div>
  )
}
