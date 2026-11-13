export const backgrounds=['orbits','stars','meteors','nebula','galaxy','grid'];
export const transitions=['wipe','iris','diagonal','shutter','fade'];
// A shared seed keeps independent OBS browsers and the preview in agreement.
export function motionChoice(choice,seed,options){return options.includes(choice)||choice==='none'?choice:options[((seed*7+3)%options.length+options.length)%options.length];}
