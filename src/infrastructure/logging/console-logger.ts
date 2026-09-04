export class ConsoleLogger {
  info(message: string, context: Record<string, string> = {}): void {
    console.log(message, context);
  }

  error(message: string, context: Record<string, string> = {}): void {
    console.error(message, context);
  }
}
