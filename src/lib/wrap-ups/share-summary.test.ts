import {expect,it} from "vitest";
import {shareSummary, summaryForPayload} from "./share-summary";
import {emptyInputs} from "./__fixtures__/inputs";
import {samplePayload} from "@/components/wrap-ups/__fixtures__/sample-payload";
const series = {type: "series" as const, id: "s1", title: "The Bear", coverUrl: null, times: 1, episodes: 3};
it("el resumen incluye episodios, series y portada, sin datos privados", () => {
 const p = samplePayload();
 const inputs = emptyInputs({seriesProgress: [{...series, secret: "nota privada"} as typeof series]});
 const s = shareSummary(p, inputs);
 expect(s.seriesProgress).toEqual({count: 1, episodes: 3});
 expect(s.covers).toEqual([{type: "series", id: "s1", title: "The Bear", coverUrl: null, times: 1}]);
 expect(JSON.stringify(s)).not.toContain("nota privada");
 expect(JSON.stringify(s.covers)).not.toContain("episodes");
});
it("completa una semanal ya generada a partir de su story", () => {
 const p=samplePayload();p.share={...p.share, covers: []};p.stories=[{id: "series_progress",items:[series],total:1},{id:"closing"}];
 const s=summaryForPayload(p);
 expect(s.seriesProgress).toEqual({count:1,episodes:3});expect(s.covers[0].id).toBe("s1");
 expect(p.share).not.toHaveProperty("seriesProgress");
});
it("una story truncada no permite afirmar el total de episodios", () => {
 const p=samplePayload();p.stories=[{id:"series_progress",items:[series],total:2}];
 expect(summaryForPayload(p).seriesProgress).toEqual({count:2,episodes:null});
});

it("portadas deduplicadas y limitadas a cuatro, contadores de todas las series", () => {
 const p=samplePayload();const finished={...series,type:"series" as const};
 const inputs=emptyInputs({finished:[finished],seriesProgress:Array.from({length:6},(_,i)=>({...series,id:"s"+(i+1)}))});
 const s=shareSummary(p,inputs);
 expect(s.covers).toHaveLength(4);expect(s.covers.map(c=>c.id)).toEqual(["s1","s2","s3","s4"]);
 expect(s.finished).toBe(1);expect(s.seriesProgress).toEqual({count:6,episodes:18});
});
