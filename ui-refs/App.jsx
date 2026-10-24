import { useState } from 'react'
import Phone from './components/Phone.jsx'
import Today from './screens/Today.jsx'
import HowISeeYou from './screens/HowISeeYou.jsx'
import MemoryGraph from './screens/MemoryGraph.jsx'
import ThingsIRemember from './screens/ThingsIRemember.jsx'
import BodySignals from './screens/BodySignals.jsx'
import Me from './screens/Me.jsx'

const SCREENS = [
  { no: '01', name: '今天', active: 'today', Screen: Today },
  { no: '02', name: '我眼中的你', active: 'remember', Screen: HowISeeYou },
  { no: '03', name: '记忆图谱', active: 'graph', Screen: MemoryGraph },
  { no: '04', name: '我记得的事', active: 'remember', Screen: ThingsIRemember },
  { no: '05', name: '身体的信号', active: 'body', Screen: BodySignals },
  { no: '06', name: '我', active: 'me', Screen: Me },
]

const SECTIONS = {
  light: {
    title: '浅色模式 · 冰川蓝 × 白',
    sub: '冰川蓝只出现在「光」与被记得的事上，白负责安静。',
  },
  dark: {
    title: '深色模式 · 冰川蓝 × 黑',
    sub: '纯黑做底，冰川蓝变成唯一的光——像极夜里被记得的那盏灯。',
  },
}

function Section({ theme }) {
  const meta = SECTIONS[theme]
  return (
    <section className={`section section--${theme}`}>
      <div className="section-head">
        <h2 className="section-title">{meta.title}</h2>
        <p className="section-sub">{meta.sub}</p>
      </div>

      <div className="row">
        {SCREENS.map(({ no, name, active, Screen }) => (
          <Phone key={no} theme={theme} label={`${no} · ${name}`} active={active}>
            <Screen />
          </Phone>
        ))}
      </div>
    </section>
  )
}

/* 支持 ?view=light|dark|all&scale=1|0.75|0.5 深链 */
const params = new URLSearchParams(window.location.search)
const qView = params.get('view')
const qScale = parseFloat(params.get('scale'))

export default function App() {
  const [view, setView] = useState(
    ['all', 'light', 'dark'].includes(qView) ? qView : 'all'
  )
  const [scale, setScale] = useState(
    [1, 0.75, 0.5].includes(qScale) ? qScale : 1
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">人生档案 · 冰川记忆</span>
          <span className="brand-sub">v1 设计稿还原 · 12 屏（浅色 6 / 深色 6）</span>
        </div>

        <div className="controls">
          <div className="seg">
            {[
              ['all', '全部'],
              ['light', '浅色'],
              ['dark', '深色'],
            ].map(([k, label]) => (
              <button
                key={k}
                className={view === k ? 'seg-btn seg-btn--on' : 'seg-btn'}
                onClick={() => setView(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="seg">
            {[
              ['100%', 1],
              ['75%', 0.75],
              ['50%', 0.5],
            ].map(([label, v]) => (
              <button
                key={label}
                className={scale === v ? 'seg-btn seg-btn--on' : 'seg-btn'}
                onClick={() => setScale(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="board" style={{ '--scale': scale }}>
        {(view === 'all' || view === 'light') && <Section theme="light" />}
        {(view === 'all' || view === 'dark') && <Section theme="dark" />}
      </main>
    </div>
  )
}
