/** Hidden company slug for workspace forms; the server re-checks membership and permission from it. */
export const OrgField = ({ slug }: { slug: string }) => <input type="hidden" name="org" value={slug} />;
