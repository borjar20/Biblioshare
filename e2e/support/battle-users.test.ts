import assert from "node:assert/strict";
import { test } from "node:test";
import { withBattleUsers } from "./battle-users";

for (const failure of ["second-auth", "first-profile", "body", "first-delete", "none"]) {
  test(`account cleanup after ${failure}`, async () => {
    const created: string[] = [];
    const deleted: string[] = [];
    const transport: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        const id = url.split("/").at(-1)!;
        deleted.push(id);
        return new Response(null, { status: failure === "first-delete" && id === "u1" ? 500 : 200 });
      }
      if (url.endsWith("/admin/users")) {
        if (failure === "second-auth" && created.length === 1) return new Response(null, { status: 500 });
        const id = `u${created.length + 1}`;
        created.push(id);
        return Response.json({ id });
      }
      return new Response(null, { status: failure === "first-profile" ? 500 : 201 });
    };
    const run = withBattleUsers("http://localhost", "test-only", async (create) => {
      await create("a");
      await create("b");
      if (failure === "body") throw new Error("assertion failed");
      return "done";
    }, transport);
    if (failure === "none") assert.equal(await run, "done");
    else await assert.rejects(run);
    assert.ok(created.length > 0);
    assert.deepEqual(deleted.sort(), created.sort());
  });
}
