import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getClasses } from './classes';
import {
  isValidClassFilter, readStoredClassFilter, writeStoredClassFilter, type ResultsClassFilter,
} from './resultsFilter';

/**
 * Klasfilter voor /resultaten en /resultaten/:id — pas zinvol zodra er
 * klassen bestaan (anders blijft `filter` op 'all' staan, ongeacht de opslag).
 *
 * Een `?klas=<id>`-parameter (bv. vanuit het klasdashboard) wint bij het
 * openen en verdwijnt daarna uit de URL, net zoals `useNewParam` dat doet met
 * `?nieuw=1`. Nadien onthoudt sessionStorage de laatste keuze voor de rest
 * van deze sessie.
 */
export function useResultsClassFilter() {
  const classes = getClasses();
  const classIds = classes.map((c) => c.id);
  const [params, setParams] = useSearchParams();
  const [filter, setFilterState] = useState<ResultsClassFilter>(() => {
    const fromQuery = params.get('klas');
    if (fromQuery && isValidClassFilter(fromQuery, classIds)) return fromQuery;
    const stored = readStoredClassFilter();
    if (stored && isValidClassFilter(stored, classIds)) return stored;
    return 'all';
  });

  useEffect(() => {
    const fromQuery = params.get('klas');
    if (!fromQuery) return;
    if (isValidClassFilter(fromQuery, classIds)) {
      setFilterState(fromQuery);
      writeStoredClassFilter(fromQuery);
    }
    const next = new URLSearchParams(params);
    next.delete('klas');
    setParams(next, { replace: true });
    // enkel de URL-parameter is de trigger, net als useNewParam; classIds volgt uit getClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const setFilter = (value: ResultsClassFilter) => {
    setFilterState(value);
    writeStoredClassFilter(value);
  };

  // Geen klassen? Dan bestaat het filter niet: altijd alles tonen.
  return { classes, filter: classes.length > 0 ? filter : ('all' as ResultsClassFilter), setFilter };
}
