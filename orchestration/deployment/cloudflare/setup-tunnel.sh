#!/bin/bash
# Setup Cloudflare Tunnel for Figure Collector application

# Step 1: Install cloudflared
echo "Installing cloudflared..."
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb

# Step 2: Authenticate with Cloudflare
echo "Authenticating with Cloudflare (follow the browser prompts)..."
cloudflared tunnel login

# Step 3: Create a tunnel
echo "Creating tunnel 'figure-collector'..."
TUNNEL_ID=$(cloudflared tunnel create figure-collector | grep -o '[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}')
echo "Tunnel ID: $TUNNEL_ID"

# Step 4: Configure tunnel
echo "Configuring tunnel..."
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOL
tunnel: $TUNNEL_ID
credentials-file: ~/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: figures.yourdomain.com
    service: http://figure-server:5051
  - hostname: api.figures.yourdomain.com
    service: http://figure-server:5050
  - hostname: scraper.figures.yourdomain.com
    service: http://figure-server:3000
  - service: http_status:404
EOL

echo "Config created at ~/.cloudflared/config.yml"
echo "IMPORTANT: Replace 'yourdomain.com' with your actual domain in the config file"

# Step 5: Route DNS
echo "To route DNS (after updating the domain in the config):"
echo "cloudflared tunnel route dns figure-collector figures.yourdomain.com"
echo "cloudflared tunnel route dns figure-collector api.figures.yourdomain.com"
echo "cloudflared tunnel route dns figure-collector scraper.figures.yourdomain.com"

# Step 6: Add monitoring scripts
echo "Creating network monitoring script..."
cat > ~/check-network.sh << 'EOL'
#!/bin/bash

# Check if network is available
if ping -c 1 google.com &> /dev/null; then
  # Network is up, check if tunnel is running
  if ! pgrep -f "cloudflared tunnel" > /dev/null; then
    # Restart cloudflared service
    sudo systemctl restart cloudflared
  fi
fi
EOL
chmod +x ~/check-network.sh

echo "Creating service monitoring script..."
cat > ~/check-services.sh << 'EOL'
#!/bin/bash

# Check if services are running
services=("docker" "cloudflared" "avahi-daemon")

for service in "${services[@]}"; do
  if ! systemctl is-active --quiet $service; then
    echo "$service is down, attempting to restart..."
    sudo systemctl restart $service
  fi
done
EOL
chmod +x ~/check-services.sh

# Step 7: Add cron jobs
echo "Adding cron jobs for monitoring..."
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/check-network.sh") | crontab -
(crontab -l 2>/dev/null; echo "*/15 * * * * ~/check-services.sh") | crontab -

echo "To start the tunnel manually: cloudflared tunnel run figure-collector"
echo "To install as a service: sudo cloudflared service install"
