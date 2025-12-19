# Apache Reverse Proxy Configuration

This directory contains Apache configuration files for deploying the F1 G-Force Sculpture Gallery with Apache as a reverse proxy.

## Prerequisites

- Apache 2.4 or higher
- Backend API running on `localhost:8000` (via Docker or local development)
- SSL certificate (for production deployment)

## Required Apache Modules

Enable the following modules before using this configuration:

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod ssl
sudo a2enmod headers
sudo a2enmod rewrite
sudo a2enmod expires
sudo a2enmod deflate
```

## Installation

### 1. Copy Frontend Files

```bash
# Create web directory
sudo mkdir -p /var/www/f1-sculpture

# Copy frontend files
sudo cp -r frontend /var/www/f1-sculpture/

# Set permissions
sudo chown -R www-data:www-data /var/www/f1-sculpture
sudo chmod -R 755 /var/www/f1-sculpture
```

### 2. Install Apache Configuration

```bash
# Copy configuration to Apache sites-available
sudo cp apache/f1-sculpture.conf /etc/apache2/sites-available/

# Edit the configuration file
sudo nano /etc/apache2/sites-available/f1-sculpture.conf
# Update: ServerName, SSL certificate paths, and DocumentRoot
```

### 3. SSL Certificates

#### Option A: Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-apache

# Obtain certificate
sudo certbot --apache -d yourdomain.com -d www.yourdomain.com
```

#### Option B: Self-Signed (Development Only)

```bash
# Generate self-signed certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/f1-sculpture.key \
  -out /etc/ssl/certs/f1-sculpture.crt

# Update certificate paths in f1-sculpture.conf
```

### 4. Enable Site and Reload Apache

```bash
# Enable the site
sudo a2ensite f1-sculpture.conf

# Test configuration
sudo apache2ctl configtest

# Reload Apache
sudo systemctl reload apache2
```

## Configuration Options

### For Production (with SSL)

The default configuration redirects HTTP to HTTPS and includes security headers.

Edit `f1-sculpture.conf`:
- Update `ServerName` to your domain
- Update SSL certificate paths
- Ensure `DocumentRoot` points to your frontend directory

### For Local Development (without SSL)

Uncomment the "Local Development Configuration" section at the bottom of `f1-sculpture.conf` and comment out the HTTPS VirtualHost.

```bash
# Add to /etc/hosts for local testing
echo "127.0.0.1 f1-sculpture.local" | sudo tee -a /etc/hosts
```

## Architecture

```
                        ┌─────────────────┐
                        │   Apache :80    │
                        │   Apache :443   │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
          ┌─────────▼─────────┐     ┌────────▼────────┐
          │  Static Files     │     │   Reverse Proxy  │
          │  (Frontend)       │     │   to Backend     │
          │  /var/www/...     │     │   localhost:8000 │
          └───────────────────┘     └────────┬────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │   FastAPI Backend │
                                    │   + WebSocket     │
                                    │   (port 8000)     │
                                    └───────────────────┘
```

## Proxy Paths

- `/` → Frontend static files
- `/api/*` → Backend API (FastAPI)
- `/health` → Backend health check
- `/ws/*` → WebSocket connections (real-time updates)

## Troubleshooting

### 1. WebSocket Connection Failed

Check Apache error log:
```bash
sudo tail -f /var/log/apache2/f1-sculpture-error.log
```

Ensure `mod_proxy_wstunnel` is enabled:
```bash
sudo a2enmod proxy_wstunnel
sudo systemctl reload apache2
```

### 2. Backend Not Responding

Verify backend is running:
```bash
curl http://localhost:8000/health
```

If using Docker:
```bash
docker-compose ps
docker-compose logs api
```

### 3. 502 Bad Gateway

- Backend is not running on port 8000
- Firewall blocking localhost:8000
- Check backend logs for errors

### 4. SSL Certificate Errors

Test certificate:
```bash
sudo certbot certificates
```

Renew certificate:
```bash
sudo certbot renew --dry-run
```

## Performance Tuning

### Enable HTTP/2 (Requires Apache 2.4.17+)

```bash
sudo a2enmod http2
```

Add to VirtualHost:
```apache
Protocols h2 http/1.1
```

### Increase Worker Limits

Edit `/etc/apache2/mods-available/mpm_event.conf`:
```apache
<IfModule mpm_event_module>
    StartServers             4
    MinSpareThreads         25
    MaxSpareThreads         75
    ThreadLimit             64
    ThreadsPerChild         25
    MaxRequestWorkers      400
    MaxConnectionsPerChild   0
</IfModule>
```

## Security Best Practices

1. **Keep Apache Updated**
   ```bash
   sudo apt-get update && sudo apt-get upgrade apache2
   ```

2. **Use Strong SSL Configuration**
   - The provided configuration uses modern TLS protocols only
   - Test SSL configuration: https://www.ssllabs.com/ssltest/

3. **Enable Firewall**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

4. **Hide Apache Version**
   Edit `/etc/apache2/conf-available/security.conf`:
   ```apache
   ServerTokens Prod
   ServerSignature Off
   ```

5. **Rate Limiting (Optional)**
   ```bash
   sudo a2enmod ratelimit
   ```

## Monitoring

### View Access Logs
```bash
sudo tail -f /var/log/apache2/f1-sculpture-access.log
```

### View Error Logs
```bash
sudo tail -f /var/log/apache2/f1-sculpture-error.log
```

### Check Apache Status
```bash
sudo systemctl status apache2
sudo apache2ctl -S  # Show virtual host configuration
```

## Alternative: Nginx Configuration

If you prefer Nginx over Apache, see the `nginx/` directory for equivalent configuration.

## Support

For issues specific to this project, see the main README.md or CLAUDE.md files.
