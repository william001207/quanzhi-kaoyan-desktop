import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { createSearchScheduler } from './search-scheduler';

type Props = Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'onKeyDown' | 'onCompositionStart' | 'onCompositionEnd'> & {
  value: string;
  onValueChange: (value: string) => void;
  onSearch: (value: string) => void;
};
export function SearchInput({ value, onValueChange, onSearch, ...props }: Props) {
  const latest = useRef(onSearch);
  latest.current = onSearch;
  const search = useMemo(() => createSearchScheduler((text) => latest.current(text)), []);
  useEffect(() => () => search.cancel(), [search]);
  return <Input {...props} value={value}
    onChange={(e) => { onValueChange(e.target.value); search.change(e.target.value); }}
    onCompositionStart={() => search.compositionStart()}
    onCompositionEnd={(e) => search.compositionEnd(e.currentTarget.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
        e.preventDefault(); search.flush(e.currentTarget.value);
      }
    }} />;
}
