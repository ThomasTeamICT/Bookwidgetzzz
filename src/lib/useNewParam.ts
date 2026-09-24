import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opent het "nieuw"-venster van een lijstpagina wanneer de URL `?nieuw=1`
 * bevat, zoals de knop "Nieuw" in de navigatie doet. Daarna verdwijnt de
 * parameter weer uit de URL, zodat terugkeren of herladen het venster niet
 * opnieuw opent.
 */
export function useNewParam(open: () => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('nieuw') !== '1') return;
    open();
    const next = new URLSearchParams(params);
    next.delete('nieuw');
    setParams(next, { replace: true });
    // open is een setter uit de pagina; enkel de URL is de trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}
