// In-process audit metadata only. Never transmitted as headers or form fields.
const contexts=new WeakMap<object,{segmentId:string;slot:number}>();
export function withRequestContext(init:RequestInit,context?:{segmentId:string;slot:number}){if(context)contexts.set(init,context);return init;}
export function requestContext(init?:RequestInit){return init?contexts.get(init):undefined;}
