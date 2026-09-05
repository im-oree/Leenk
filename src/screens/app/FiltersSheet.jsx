import Sheet from '../../components/ui/Sheet'
import Chip from '../../components/ui/Chip'
import Button from '../../components/ui/Button'
import RangeSlider from '../../components/ui/RangeSlider'
import { useStore } from '../../lib/store'
import { DEPARTMENTS, INTENTS } from '../../lib/mock'

const SCOPES = [
  { id: 'home', label: 'My campus' },
  { id: 'nearby', label: 'Nearby campuses' },
  { id: 'anywhere', label: 'Anywhere' },
]

export default function FiltersSheet({ open, onClose }) {
  const { filters, dispatch, toast } = useStore()
  const set = (patch) => dispatch({ type: 'filters/set', patch })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      subtitle="Shape who shows up in your stack"
      footer={
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            onClick={() => set({ ageRange: [18, 26], scope: 'nearby', intent: 'any', department: 'any' })}
          >
            Reset
          </Button>
          <Button full onClick={() => { toast('Filters updated', 'success'); onClose() }}>
            Show results
          </Button>
        </div>
      }
    >
      <div className="space-y-7 pb-2">
        <div>
          <p className="text-[13px] font-medium muted mb-3">Age range</p>
          <RangeSlider min={18} max={40} value={filters.ageRange} onChange={(v) => set({ ageRange: v })} />
        </div>

        <div>
          <p className="text-[13px] font-medium muted mb-3">Campus scope</p>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <Chip key={s.id} selected={filters.scope === s.id} onClick={() => set({ scope: s.id })}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[13px] font-medium muted mb-3">Looking for</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={filters.intent === 'any'} onClick={() => set({ intent: 'any' })}>Anything</Chip>
            {INTENTS.map((i) => (
              <Chip key={i.id} selected={filters.intent === i.id} onClick={() => set({ intent: i.id })}>
                {i.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[13px] font-medium muted mb-3">Department</p>
          <div className="flex flex-wrap gap-2">
            <Chip size="sm" selected={filters.department === 'any'} onClick={() => set({ department: 'any' })}>Any</Chip>
            {DEPARTMENTS.slice(0, 8).map((d) => (
              <Chip key={d} size="sm" selected={filters.department === d} onClick={() => set({ department: d })}>
                {d}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
