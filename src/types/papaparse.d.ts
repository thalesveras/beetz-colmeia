// Tipagem mínima do papaparse — evita depender de @types/papaparse.
// Cobre só o que o Importador de perfis usa (parse de arquivo com header).
declare module 'papaparse' {
  interface ParseResult<T = any> {
    data: T[]
    errors: { type: string; code: string; message: string; row: number }[]
    meta: { fields?: string[]; delimiter: string; truncated: boolean }
  }

  interface ParseConfig<T = any> {
    header?: boolean
    skipEmptyLines?: boolean | 'greedy'
    complete?: (results: ParseResult<T>) => void
    error?: (error: any) => void
    [key: string]: any
  }

  function parse<T = any>(input: File | string, config?: ParseConfig<T>): any

  const Papa: { parse: typeof parse }
  export default Papa
}
