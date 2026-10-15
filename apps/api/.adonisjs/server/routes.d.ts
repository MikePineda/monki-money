import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'config.show': { paramsTuple?: []; params?: {} }
    'spa.fallback': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
  }
  GET: {
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'config.show': { paramsTuple?: []; params?: {} }
    'spa.fallback': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
  }
  HEAD: {
    'health.ready': { paramsTuple?: []; params?: {} }
    'health.live': { paramsTuple?: []; params?: {} }
    'config.show': { paramsTuple?: []; params?: {} }
    'spa.fallback': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}