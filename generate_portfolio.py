import re
import datetime # Import datetime module
from jinja2 import Environment, FileSystemLoader

def parse_markdown(md_file):
    with open(md_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    portfolio_data = {
        "hero_title": "",
        "hero_subtitle": "",
        "sections": []
    }
    current_section = None
    current_card = None

    i = 0
    # Parse Hero section first using indexing
    if i < len(lines) and lines[i].startswith('# '):
        portfolio_data["hero_title"] = lines[i][2:].strip()
        i += 1
        if i < len(lines) and not lines[i].startswith('---') and not lines[i].startswith('## ') and not lines[i].startswith('id:'):
            portfolio_data["hero_subtitle"] = lines[i].strip()
            i += 1

    # Parse Sections and Cards using index
    while i < len(lines):
        line = lines[i].strip()

        if not line: # Skip empty lines
            i += 1
            continue

        if line.startswith('---'):
            # Finalize the previous card and section before starting anew
            if current_card and current_section:
                current_section["cards"].append(current_card)
                current_card = None
            if current_section:
                portfolio_data["sections"].append(current_section)
                current_section = None
            i += 1
            continue

        if line.startswith('id:'):
            # Finalize previous section if exists
            if current_section:
                 if current_card:
                    current_section["cards"].append(current_card)
                    current_card = None
                 portfolio_data["sections"].append(current_section)

            section_id = line.split(':', 1)[1].strip()
            # Initialize new section, explicitly setting icon_path to None
            current_section = {"id": section_id, "title": "", "icon_path": None, "cards": []}
            i += 1 # Move past id: line

            # Check for optional icon: line immediately after id:
            if i < len(lines) and lines[i].strip().startswith('icon:'):
                current_section["icon_path"] = lines[i].split(':', 1)[1].strip()
                i += 1 # Consume icon line
            # Expect ## line next
            continue # Process next line (which should be ## or ---)

        if line.startswith('## '):
            # Finalize previous card if still active
            if current_card and current_section:
                current_section["cards"].append(current_card)
                current_card = None

            section_title = line[3:].strip()
            if current_section and not current_section["title"]: # Section started by id:
                 current_section["title"] = section_title
                 # Icon should have been processed after id: if present
            else: # Section starts with ##, finalize previous if any
                if current_section:
                    portfolio_data["sections"].append(current_section)
                section_id = section_title.lower().replace(' ', '-') # Auto-generate id if needed
                current_section = {"id": section_id, "title": section_title, "icon_path": None, "cards": []}

            i += 1 # Move past ## line

            # Check for optional icon: line immediately after ## (only if not set via id:)
            if current_section and not current_section.get("icon_path"):
                 if i < len(lines) and lines[i].strip().startswith('icon:'):
                    current_section["icon_path"] = lines[i].split(':', 1)[1].strip()
                    i += 1 # Consume icon line

            continue # Process next line (should be ### or ---)

        if line.startswith('### '):
            # Finalize the previous card before starting a new one
            if current_card and current_section:
                current_section["cards"].append(current_card)
            current_card = {"title": line[4:].strip(), "link": "#", "image": None, "description": [], "is_special": False}
            i += 1
            continue

        # --- Card details parsing ---
        # Ensure we are processing lines within a card context
        if current_section and current_card:
            processed_card_detail = False
            # Parse Card Link in [Text](URL) format
            link_match = re.match(r'^\s*\[([^\]]+)\]\(([^\)]+)\)\s*$', line)
            if link_match:
                link_url = link_match.group(2)
                if link_url != 'link_placeholder':
                     current_card["link"] = link_url
                processed_card_detail = True

            # Parse Card Image
            if not processed_card_detail:
                img_match = re.match(r'^\s*!\[([^\]]*)\]\(([^\)]+)\)(\{type=special\})?\s*$', line)
                if img_match:
                    alt_text = img_match.group(1)
                    img_src = img_match.group(2)
                    special_flag = img_match.group(3)
                    current_card["image"] = {"src": img_src, "alt": alt_text}
                    if special_flag:
                        current_card["is_special"] = True
                    processed_card_detail = True

            # Parse plain URL if link is not set yet
            if not processed_card_detail and current_card["link"] == "#":
                url_match = re.match(r'^\s*(https?://\S+)\s*$', line)
                if url_match:
                    current_card["link"] = url_match.group(1)
                    processed_card_detail = True

            # If it wasn't a link or image, treat as Description
            if not processed_card_detail and line:
                current_card["description"].append(line)
                processed_card_detail = True # Consider description as processed detail

            # If any card detail was processed, move to next line
            if processed_card_detail:
                 i += 1
                 continue
        # --- End Card details parsing ---

        # If the line didn't match any pattern above, just move to the next line
        i += 1


    # Add the last processed card and section after the loop finishes
    if current_card and current_section:
        current_section["cards"].append(current_card)
    if current_section:
        portfolio_data["sections"].append(current_section)

    return portfolio_data

def render_html(data, template_file, output_file):
    # Ensure the template directory is correctly specified (current directory in this case)
    env = Environment(loader=FileSystemLoader('.'), trim_blocks=True, lstrip_blocks=True)
    template = env.get_template(template_file)

    # Get current year
    current_year = datetime.datetime.now().year

    # Pass the main data and the current year to the template
    render_data = {
        "portfolio_data": data,
        "current_year": current_year
    }
    html_content = template.render(render_data)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

if __name__ == "__main__":
    markdown_file = "portforio/portforio.md"
    template_file = "portforio/template.html"
    # Output to a different file initially to avoid accidental overwrites during testing
    output_file = "portforio/portforio_generated.html"

    if not re.match(r'^[\w\.\-\/]+$', markdown_file) or \
       not re.match(r'^[\w\.\-\/]+$', template_file) or \
       not re.match(r'^[\w\.\-\/]+$', output_file):
        print("Error: Invalid file path characters.")
    else:
        try:
            portfolio_data = parse_markdown(markdown_file)
            # import json # Optional: for pretty printing the parsed data
            # print(json.dumps(portfolio_data, indent=2, ensure_ascii=False))
            render_html(portfolio_data, template_file, output_file)
            print(f"Successfully generated {output_file} from {markdown_file} using {template_file}")
        except FileNotFoundError as e:
            print(f"Error: File not found - {e}")
        except Exception as e:
            print(f"An error occurred: {e}") 