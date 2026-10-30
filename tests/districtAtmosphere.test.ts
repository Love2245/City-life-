import {it,expect} from "vitest";
import {districtAtmosphere} from "../src/lib/districtAtmosphere";
import {atlasVisualFor} from "../src/lib/mapVisuals";
it("background filters are removed; native time/weather artwork still switches",()=>{
  for(const hour of [12,18,21,1]) for(const weather of ["sunny","cloudy","rain","snow","heatwave","coldwave"] as const)
    expect(districtAtmosphere("development",hour,weather,true).filter).toBe("none");
  expect(atlasVisualFor("development","sunny",21).url).not.toBe(atlasVisualFor("development","sunny",12).url);
  expect(atlasVisualFor("downtown","rain",12).url).not.toBe(atlasVisualFor("downtown","sunny",12).url);
});
