import {Query} from '../lib/index';

const i : Query.QueryInterface<any> = [
	["page", "string", "home", (x: string) => x === "home"],
	["num", "integer", 0]
];

const i2: Query.QueryInterface<any> = [
	["x", "integer", 12],
	["y", "integer", 64],
	["z", "integer", 32]
];

function test() {
    let spec = Query.QuerySpec.New(i).Get(() => {throw "Error invalid spec i"});
    let spec2 = Query.QuerySpec.New(i2).Get(() => {throw "Error invalid spec i2"});

    // parse a query string into two maps

    let resChain = spec.QueryFromString("?page=home&num=5&x=10&y=24").Get(() => {throw "Failed to parse string"});
    
    let resMap = resChain.Get();
    console.log(resMap);
    console.log(resChain.GetErrors());

    spec2.QueryChain(resChain, true);

    let resMap2 = resChain.Get();
    console.log(resMap2);
    console.log(resChain.GetErrors());

    // build a query string from two specs

    let s = spec2.StringDefault();
    console.log(s.Get());
    console.log(s.GetErrors());
    spec.StringChain(s, resMap, false);
    console.log(s.Get());
    console.log(s.GetErrors());
}