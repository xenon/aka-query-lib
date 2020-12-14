import {Optional, Immutable} from 'aka-functional-lib';

type Query<T> = Query.QuerySpec<T>
module Query {
	type QueryInterface<T> = QueryInterfaceItem<T>[];
	type QueryInterfaceItem<T> = [string, string, T] | [string, string, T, QueryConstraintCheck<T>]
	type QueryConstraintCheck<T> = (type: T) => boolean;
	
	type QueryTypeEnvironment<T> = Immutable<Map<string, [QueryTypeCheck<T>, QueryTypeToStr<T>]>>;
	type QueryTypeCheck<T> = (val: string) => Optional<T>;
	type QueryTypeToStr<T> = (val: T) => string;

	type RawQuery = Map<string, string>;
	type QueryValues<T> = Map<string, T>;

	//type QueryResult<T> = [[QueryValues<T>, QueryError[]], RawQuery];

	enum QueryErrors {
		TypeNotInEnvironment = "TypeNotInEnvironment",
		QueryMissingVariable = "QueryMissingVariable",
		TypeCheckFailure = "TypeCheckFailure",
		QueryConstraintFailure = "QueryConstraintFailure",
		BadTypeEnvironment = "BadTypeEnvironment",
	}
	type QueryError = [string, QueryErrors];


	interface ResultChain<T> {
		Get: () => T,
		GetErrors: () => QueryError[]
	}
	
	class QueryRes<T> implements ResultChain<QueryValues<T>> {
		private query: QueryValues<T>;
		private error: QueryError[];
		private chain: RawQuery;
		constructor(chain: RawQuery) {
			this.query = new Map();
			this.error = [];
			this.chain = chain;
		}
		public Get() { return new Map(this.query); }
		public GetErrors() { return [...this.error]; }
		public GetChain() { return this.chain; }
		public Update(query: QueryValues<T>, error: QueryError[]) {
			this.query = query;
			this.error = error;
		}
	}

	class QueryStr implements ResultChain<string> {
		private query: string;
		private error: QueryError[];
		constructor(query: string) {
			this.query = query;
			this.error = [];
		}
		public Get() {
			let res: string = this.query;
			res = '?' + res.substr(1);
			return res;	
		}
		public GetErrors() { return [...this.error]; }
		public Update(query: string, error: QueryError[]) {
			this.query += query;
			this.error = error;
		}
	}
	export class QuerySpec<T> {
		private interface: QueryInterface<T>;
		private types: QueryTypeEnvironment<T>;
		private constructor(i: QueryInterface<T>, t: QueryTypeEnvironment<T>) {
			this.interface = i;
			this.types = t;
		}
		public static New<T>(i: QueryInterface<T>, t: QueryTypeEnvironment<T> = env): Optional<QuerySpec<T>> {
			if (VerifyTypeEnvironment(i, t).length > 0 ||
				VerifyDefaultValues(i).length > 0) {
					return Optional.None();
			}
			return Optional.Some(new QuerySpec(i, t));
		}
		public QueryDefault<U>(): QueryRes<U> {
			let res = new QueryRes<U>(new Map());
			ProcessRawQuery(res, this.interface, this.types, true);
			return res!;
		} 
		public QueryFromString<U>(str: string, insertDefaultVal: boolean = false): Optional<QueryRes<U>> {
			let rawQuery = GetRawQuery(str);
			return rawQuery.Match(
				(val) => {
					let res = new QueryRes<U>(val);
					ProcessRawQuery<T, U>(res, this.interface, this.types, insertDefaultVal);
					return Optional.Some(res);
				},
				() => { return Optional.None<QueryRes<U>>() }
			);
		}
		public QueryChain<U>(res: QueryRes<U>, insertDefaultVal: boolean = false): void {
			ProcessRawQuery<T,U>(res, this.interface, this.types, insertDefaultVal);
		}
		public QueryFromStringWithDefault<U>(str: string, insertDefaultVal: boolean = false): QueryRes<U> {
			let q = this.QueryFromString<U>(str, insertDefaultVal);
			return q.Match(
				(val) => { return val; },
				() => { return this.QueryDefault<U>(); }
			);
		}
		public StringDefault(): QueryStr {
			let d = this.QueryDefault<T>();
			let s = new QueryStr("");
			BuildQueryString<T>(s, d.Get(), this.interface, this.types, true);
			return s;
		}
		public StringFromQuery(query: QueryValues<T>, insertDefaultVal: boolean = false): QueryStr {
			let s = new QueryStr("");
			BuildQueryString<T>(s, query, this.interface, this.types, insertDefaultVal);
			return s;
		}
		public StringChain(res: QueryStr, query: QueryValues<T>, insertDefaultVal: boolean = false): void {
			BuildQueryString(res, query, this.interface, this.types, insertDefaultVal);
		}
	}

	function GetRawQuery(searchQuery: string): Optional<RawQuery> {
		try {
			let rawQueries = decodeURIComponent(searchQuery).substr(1).split('&');
			let map = new Map();
			for (let q = 0; q < rawQueries.length; ++q) {
				const res = rawQueries[q].split('=')
				if (res.length == 2 && res[0] !== '' && !map.has(res[0])) {
					// deduplicates by only taking the first defined value of a param, rest are discarded
					map.set(res[0], res[1]);
				}
				// Every query must be of form thing=value, no flags or multi-equals, if thing=val1&...&thing=val2 then thing=val1 in RawQuery, no empty = like "=2"
			}
			return Optional.Some(map);
		}
		catch (e) {
			return Optional.None();
		}
	}

	// Assume VerifyTypeEnvironment(interf, env) = []
	// Assume query has no duplicates (it's impossible anyways)
	function ProcessRawQuery<T, U>(res: QueryRes<U>, interf: QueryInterface<T>, env: QueryTypeEnvironment<T>, insertDefaultVal: boolean = false): void {
		function insertDefault(val: QueryInterfaceItem<T>, q: QueryValues<T>): void {
			if (insertDefaultVal === true) {
				q.set(val[0], val[2]);
			}
		}
		let typedQuery = new Map();
		let errorList: QueryError[] = [];
		let query = res.GetChain();
		for (let i = 0; i < interf.length; ++i) {
			const valToFind: QueryInterfaceItem<any> = interf[i];
			if (!query.has(valToFind[0])) {
				// query is missing the variable
				if (!insertDefaultVal) {
					errorList.push([valToFind[0], QueryErrors.QueryMissingVariable]);
				}
				insertDefault(valToFind, typedQuery);
				continue;
			}
			let t: QueryTypeCheck<T> = env.get(valToFind[1])![0] as QueryTypeCheck<T>;
			let typeCheckVal: Optional<T> = t(query.get(valToFind[0]) as string);
			typeCheckVal.Match(
				(val) => {
					if (valToFind.length === 4 && !valToFind[3](val)) {
						errorList.push([valToFind[0], QueryErrors.QueryConstraintFailure]);
						insertDefault(valToFind, typedQuery);
						query.delete(valToFind[0]); // chain the query
						return;
					}
					// either passed constraint check or didn't have one
					typedQuery.set(valToFind[0], val);
				},
				() => {
					// failed to typecheck
					errorList.push([valToFind[0], QueryErrors.TypeCheckFailure]);
					insertDefault(valToFind, typedQuery);
				}
			);
			query.delete(valToFind[0]); // chain the query
		}
		// update state object
		res.Update(typedQuery, errorList);
	}

	function BuildQueryString<T>(res: QueryStr, query: QueryValues<T>, interf: QueryInterface<T>, env: QueryTypeEnvironment<T>, insertDefaultVal: boolean = false): void {
		function insertQuery(q: string[], key: string, val: string): void {
			let pStr = key + '=' + val;
			q.push('&' + pStr);
		}
		function insertDefault(val: QueryInterfaceItem<T>, q: string[]): void {
			if (insertDefaultVal === true) {
				let type = env.get(val[1]);
				if (type) {
					insertQuery(q, val[0], (type[1] as QueryTypeToStr<T>)(val[2]));
				} else {
					// only happens if type environment mismatch with interface
					// check using VerifyTypeEnvironment
					throw QueryErrors.BadTypeEnvironment;
				}
			} 
		}
		let strQuery: string[] = [''];
		let errorList: QueryError[] = [];
		for (let i = 0; i < interf.length; ++i) {
			const valToFind: QueryInterfaceItem<any> = interf[i];
			if (!query.has(valToFind[0])) {
				if (!insertDefaultVal) {
					errorList.push([valToFind[0], QueryErrors.QueryMissingVariable]);
				}
				insertDefault(valToFind, strQuery);
				continue;
			}
			let t: QueryTypeToStr<T> = env.get(valToFind[1])![1] as QueryTypeToStr<T>;
			let val: T = query.get(valToFind[0]) as T;
			let result = t(val);
			if (valToFind.length === 4 && !valToFind[3](val)) {
				errorList.push([valToFind[0], QueryErrors.QueryConstraintFailure]);
				insertDefault(valToFind, strQuery);
				continue;
			}
			insertQuery(strQuery, valToFind[0], result);
		}
		res.Update(strQuery.join(''), errorList);
	}

	// Functions to verify if interfaces and type environments work properly
	function VerifyTypeEnvironment<T>(interf: QueryInterface<T>, env: QueryTypeEnvironment<T>): QueryError[] {
		let errorList: QueryError[] = [];
		for (let i = 0; i < interf.length; ++i) {
			const typeToFind: string = interf[i][1];
			if (!env.has(typeToFind)) {
				errorList.push([typeToFind, QueryErrors.TypeNotInEnvironment]);
			}
		}
		return errorList;
	}

	function VerifyDefaultValues<T>(interf: QueryInterface<T>): QueryError[] {
		let errorList: QueryError[] = [];
		for (let i = 0; i < interf.length; ++i) {
			const val = interf[i];
			if (val.length === 4 && !val[3](val[2])) {
				errorList.push([val[0], QueryErrors.QueryConstraintFailure]);
			}
		}
		return errorList;
	}

	export function UnionTypeEnvironment<T, U>(t1: QueryTypeEnvironment<T>, t2: QueryTypeEnvironment<U>): Optional<QueryTypeEnvironment<T | U>> {
		let res = new Map();
		for (let [key, val] of t1) {
			if (t2.has(key)) {
				return Optional.None();
			}
			res.set(key, val);
		}
		for (let [key, val] of t2) {
			res.set(key, val);
		}
		return Optional.Some(res);
	}

	/* Examples */
	export const i : QueryInterface<any> = [
		["page", "string", "home", (x: string) => x === "home"],
		["num", "integer", 0]
	];

	export const i2: QueryInterface<any> = [
		["x", "integer", 12],
		["y", "integer", 64],
		["z", "integer", 32]
	]

	export const env: QueryTypeEnvironment<any> = new Map([
		["string",
			[(val: string) => Optional.Some(val),
			 (val: string) => val]
		],
		["integer",
			[(val: string) => {
				let i = parseInt(val);
				return isNaN(i) ? Optional.None() : Optional.Some(i);
			},
			(val: number) => val.toString()
			]
		],
		["float",
			[(val: string) => {
				let i = parseFloat(val);
				return isNaN(i) ? Optional.None() : Optional.Some(i);
			},
			(val: number) => val.toString()
			]
		],
		["boolean",
			[(val: string) => {
				if (val === "true") {
					return Optional.Some(true);
				} else if (val === "false") {
					return Optional.Some(false);
				}
				return Optional.None();
			},
			(val: boolean) => val ? "true" : "false"
			]	
		],
	]);

	//export const res = ProcessRawQuery(GetRawQuery("?page=home&num=5&x=10&y=24").Get(() => {throw "Error"}), i, env);
	function test() {
		let spec = QuerySpec.New(i).Get(() => {throw "Error invalid spec i"});
		let spec2 = QuerySpec.New(i2).Get(() => {throw "Error invalid spec i2"});

		let resChain = spec.QueryFromString("?page=home&num=5&x=10&y=24").Get(() => {throw "Failed to parse string"});
		
		let resMap = resChain.Get();
		console.log(resMap);

		spec2.QueryChain(resChain, true);

		let resMap2 = resChain.Get();
		console.log(resMap2);
	}
}

export {
	Query,
	Optional,
	Immutable
}