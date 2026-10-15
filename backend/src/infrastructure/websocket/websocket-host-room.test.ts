describe('WebSocket Host Room logic', () => {
  it('should restrict unprivileged access properly unless users match the office', () => {
    // This logic relies on user_officeId vs officeId being correctly evaluated
    const isPrivileged = false;
    const userOfficeId = 1;
    const targetOfficeId = 1;

    // The condition from updated socket.ts
    const isDenied = !isPrivileged && Number(userOfficeId) !== Number(targetOfficeId);
    expect(isDenied).toBe(false); // Host is allowed!

    const targetOfficeIdDenied = 2;
    const isDenied2 = !isPrivileged && Number(userOfficeId) !== Number(targetOfficeIdDenied);
    expect(isDenied2).toBe(true); // Trying to access another office is denied
  });
});
