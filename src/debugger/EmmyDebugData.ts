import * as proto from "./EmmyDebugProto";
import { DebugProtocol } from "vscode-debugprotocol";
import { Handles } from "vscode-debugadapter";

export interface IEmmyStackContext {
    handles: Handles<IEmmyStackNode>;
    eval(expr: string, depth: number): Promise<proto.IVariable | null>;
}

export interface IEmmyStackNode {
    toVariable(ctx: IEmmyStackContext): DebugProtocol.Variable;
    computeChildren(ctx: IEmmyStackContext): Promise<Array<IEmmyStackNode>>;
}

export class EmmyStack implements IEmmyStackNode {
    constructor(
        private data: proto.IStack
    ) {
    }

    toVariable(ctx: IEmmyStackContext): DebugProtocol.Variable {
        throw new Error('Method not implemented.');
    }

    async computeChildren(ctx: IEmmyStackContext): Promise<Array<IEmmyStackNode>> {
        const variables = this.data.localVariables.concat(this.data.upvalueVariables);
        return variables.map(v => {
            return new EmmyVariable(v);
        });
    }
}

export class EmmyVariable implements IEmmyStackNode {
    private variable: DebugProtocol.Variable;

    constructor(
        private data: proto.IVariable,
        private parent?: EmmyVariable,
    ) {
        let value = this.data.value;
        switch (this.data.valueType) {
            case proto.ValueType.TFUNCTION:
                value = 'function';
                break;
            case proto.ValueType.TTABLE:
                value = 'table';
                break;
        }
        this.variable = { name: this.data.name, value: value, variablesReference: 0 };
    }

    toVariable(ctx: IEmmyStackContext): DebugProtocol.Variable {
        const ref = ctx.handles.create(this);
        if (this.data.valueType === proto.ValueType.TTABLE ||
            this.data.valueType === proto.ValueType.TUSERDATA ||
            this.data.valueType === proto.ValueType.GROUP) {
            this.variable.variablesReference = ref;
        }
        return this.variable;
    }
    
    private getExpr(): string {
        let arr: proto.IVariable[] = [];
        let n: EmmyVariable | undefined = this;
        while (n) {
            if (n.data.valueType !== proto.ValueType.GROUP) {
                arr.push(n.data);
            }
            n = n.parent;
        }
        arr = arr.reverse();
        return arr.map(it => it.name).join('.');
    }

    sortVariables(a: proto.IVariable, b: proto.IVariable): number {
        const w1 = a.valueType > proto.ValueType.TTHREAD ? 0 : 1;
        const w2 = b.valueType > proto.ValueType.TTHREAD ? 0 : 1;
        if (w1 !== w2) {
            return w1 - w2;
        }
        return a.name.localeCompare(b.name);
    }

    async computeChildren(ctx: IEmmyStackContext): Promise<IEmmyStackNode[]> {
        let children = this.data.children;
        if (this.data.valueType === proto.ValueType.GROUP) {
            children = this.data.children;
        }
        else {
            const evalResult = await ctx.eval(this.getExpr(), 2);
            if (evalResult && evalResult.children) {
                children = evalResult.children;
            }
        }
        if (children) {
            return children.sort(this.sortVariables).map(v => new EmmyVariable(v, this));
        }
        return [];
    }
}