import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { APP_CONFIG_TOKEN } from '../../core/mqtt/app-config.token';

@Component({
  selector: 'app-login', imports: [FormsModule],
  templateUrl: './login.component.html', styleUrl: './login.component.scss',
})
export class LoginComponent {
  username = 'Guest';
  password = 'Guest1234';
  errorMsg = '';
  isLoading = false;
  private readonly config = inject(APP_CONFIG_TOKEN);
  readonly configured = Boolean(this.config.brokerUrl);
  private readonly auth = inject(AuthService);
  async onSubmit(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true; this.errorMsg = '';
    const password = this.password;
    this.password = '';
    try { await this.auth.login(this.username, password); }
    catch (error) { this.errorMsg = (error as Error).message; }
    finally { this.isLoading = false; }
  }
}
